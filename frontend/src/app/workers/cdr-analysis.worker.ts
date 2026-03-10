/// <reference lib="webworker" />

import JSZip from 'jszip';

// The worker receives { id: string, arrayBuffer: ArrayBuffer }
// and posts back WorkerMessage objects.

self.addEventListener('message', async (event) => {
  const { id, arrayBuffer, filename } = event.data as {
    id: string;
    arrayBuffer: ArrayBuffer;
    filename: string;
  };

  try {
    postProgress(id, 10);

    const zip = await JSZip.loadAsync(arrayBuffer);

    postProgress(id, 40);

    // --- Parse META-INF/metadata.xml ---
    const metadataFile =
      zip.file('META-INF/metadata.xml') ||
      zip.file('meta-inf/metadata.xml');

    // --- Parse META-INF/container.xml for content ODF path if needed ---
    const containerFile =
      zip.file('META-INF/container.xml') ||
      zip.file('meta-inf/container.xml');
      
    // --- Parse META-INF/textinfo.xml ---
    const textinfoFile =
      zip.file('META-INF/textinfo.xml') ||
      zip.file('meta-inf/textinfo.xml');

    let appVersion = 'Unknown';
    let numPages = 0;
    let rawWidth = 0;
    let rawHeight = 0;

    if (metadataFile) {
      const xmlStr = await metadataFile.async('string');
      
      const rawMetadata = {
        fileIdentity: {
          author: extractXmlValue(xmlStr, 'dc:creator'),
          lastAuthor: extractXmlValue(xmlStr, 'crl:LastAuthor'),
          uuid: extractXmlValue(xmlStr, 'dc:identifier'),
        },
        timestamps: {
          createDate: extractXmlValue(xmlStr, 'xmp:CreateDate'),
          modifyDate: extractXmlValue(xmlStr, 'xmp:ModifyDate'),
        },
        softwareInfo: {
          productName: extractXmlValue(xmlStr, 'cdr:ProductName'),
          appVersion: extractXmlValue(xmlStr, 'cdr:AppVersion'),
        },
        physicalSpecs: {
          pageDimensions: extractXmlValue(xmlStr, 'cdrinfo:PageDimensions'),
          numPages: extractXmlValue(xmlStr, 'cdrinfo:NumPages'),
          resolutionX: extractXmlValue(xmlStr, 'cdrinfo:ResolutionX'),
          resolutionY: extractXmlValue(xmlStr, 'cdrinfo:ResolutionY'),
        },
        objectStats: {
          total: extractXmlValue(xmlStr, 'inObj:Total'),
          bitmap: extractXmlValue(xmlStr, 'inObj:Bitmap'),
          curve: extractXmlValue(xmlStr, 'inObj:Curve'),
        }
      };

      console.group('--- CDR Metadata Extraction ---');
      console.dir(rawMetadata);
      console.groupEnd();

      appVersion = rawMetadata.softwareInfo.appVersion || 'Unknown';
      numPages = parseInt(rawMetadata.physicalSpecs.numPages || '0', 10);
      rawWidth = parseFloat(extractXmlValue(xmlStr, 'cdrinfo:PageWidth') || '0');
      rawHeight = parseFloat(extractXmlValue(xmlStr, 'cdrinfo:PageHeight') || '0');
    }
    
    if (textinfoFile) {
      const textXmlStr = await textinfoFile.async('string');
      console.group('--- CDR TextInfo Extraction ---');
      console.log(`textinfo.xml size: ${textXmlStr.length} bytes`);
      console.log(textXmlStr.substring(0, 500) + (textXmlStr.length > 500 ? '...' : ''));
      console.groupEnd();
    }

    // Fallback: try container.xml if metadata.xml didn't have all fields
    if ((numPages === 0 || rawWidth === 0) && containerFile) {
      const xmlStr = await containerFile.async('string');
      if (numPages === 0) {
        numPages = parseInt(extractXmlValue(xmlStr, 'cdrinfo:NumPages') || '0', 10);
      }
      if (rawWidth === 0) {
        rawWidth = parseFloat(extractXmlValue(xmlStr, 'cdrinfo:PageWidth') || '0');
      }
      if (rawHeight === 0) {
        rawHeight = parseFloat(extractXmlValue(xmlStr, 'cdrinfo:PageHeight') || '0');
      }
      if (appVersion === 'Unknown') {
        appVersion = extractXmlValue(xmlStr, 'cdr:AppVersion') || 'Unknown';
      }
    }

    postProgress(id, 65);

    // Unit conversion: raw units are 1/10th micron
    // 1 inch = 254000 (1/10th micron units)
    const UNITS_PER_INCH = 254000;
    const widthInches = rawWidth / UNITS_PER_INCH;
    const heightInches = rawHeight / UNITS_PER_INCH;
    const widthFeet = widthInches / 12;
    const heightFeet = heightInches / 12;

    postProgress(id, 80);

    // --- Extract preview image ---
    let previewBase64: string | null = null;

    const previewFile =
      zip.file('previews/page1.png') ||
      zip.file('Previews/page1.png') ||
      zip.file('previews/Page1.png') ||
      zip.file('thumbnail.png') ||
      zip.file('Thumbnails/thumbnail.png');

    if (previewFile) {
      const previewBytes = await previewFile.async('uint8array');
      previewBase64 = uint8ArrayToBase64(previewBytes);
    }

    postProgress(id, 100);

    const result = {
      appVersion,
      numPages,
      rawWidth,
      rawHeight,
      widthInches,
      heightInches,
      widthFeet,
      heightFeet,
      previewBase64,
    };

    self.postMessage({
      type: 'result',
      id,
      payload: result,
    });
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      id,
      payload: { message: err?.message || 'Unknown error during parsing.' },
    });
  }
});

function extractXmlValue(xml: string, tagName: string): string | null {
  // Match both <tag>value</tag> and <tag attr="...">value</tag>
  const regex = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([^<]*)<\\/${tagName}>`,
    'i'
  );
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function postProgress(id: string, progress: number) {
  self.postMessage({ type: 'progress', id, progress });
}
