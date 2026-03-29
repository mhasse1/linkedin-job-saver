// LinkedIn Job Downloader - Background Script
// Handles file creation and download functionality

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[LJD:bg]', ...args); };

// HTML-escape text to prevent XSS in generated HTML
const escapeHTML = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Detect LinkedIn job pages on tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.match(/linkedin\.com\/jobs\/view\/\d+/)) {
    log('LinkedIn job page detected in tab:', tabId);

    chrome.action.setBadgeText({ text: 'JOB', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#0A66C2', tabId });

    chrome.storage.session.set({ [`tab_${tabId}_url`]: tab.url });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'jobPageDetected') {
    log('Job page detection message received:', message);

    if (sender.tab) {
      const tabId = sender.tab.id;
      chrome.action.setBadgeText({ text: 'JOB', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#0A66C2', tabId });

      chrome.storage.session.set({
        [`tab_${tabId}_jobData`]: {
          jobTitle: message.jobTitle,
          companyName: message.companyName,
          url: message.url,
          tabId
        }
      });
    }

    sendResponse({ success: true });
  }

  if (message.action === 'createAndDownloadHTML') {
    handleCreateAndDownload(message.jobData, sendResponse);
    return true; // keep channel open for async response
  }

  return true;
});

// Async download handler
const handleCreateAndDownload = async (jobData, sendResponse) => {
  try {
    log('Creating HTML file for', jobData.companyName, '-', jobData.jobTitle);

    const htmlContent = formatJobAsHTML(jobData);
    const fileName = sanitizeFileName(`${jobData.companyName}-${jobData.jobTitle}.html`);
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      saveAs: false
    });

    log('Download started with ID:', downloadId);
    sendResponse({ success: true, downloadId });
  } catch (error) {
    console.error('Download failed:', error);
    sendResponse({ success: false, error: error.message });
  }
};

// Sanitize filename
const sanitizeFileName = (name) =>
  name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100);

// Clean and sanitize job description HTML using DOMParser
const cleanJobDescriptionHTML = (html) => {
  if (!html || html === 'No job description available.') {
    return '<p>No job description available.</p>';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous elements
  doc.querySelectorAll('script, style, iframe, object, embed, form, input, textarea, select, button')
    .forEach(el => el.remove());

  // Strip event handler attributes and javascript: URIs
  for (const el of doc.body.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') ||
          (['href', 'src', 'action'].includes(attr.name) &&
           attr.value.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
    // Safety for links
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }

  return doc.body.innerHTML;
};

// Generate styled HTML file from job data
const formatJobAsHTML = (jobData) => {
  const cleanDescription = cleanJobDescriptionHTML(jobData.jobDescription);

  // Escape all text fields to prevent XSS
  const title = escapeHTML(jobData.jobTitle);
  const company = escapeHTML(jobData.companyName);
  const location = escapeHTML(jobData.location);
  const posted = escapeHTML(jobData.whenPosted);
  const applicants = escapeHTML(jobData.applicants);
  const salary = escapeHTML(jobData.salaryRange);
  const workType = escapeHTML(jobData.workType);
  const jobType = escapeHTML(jobData.jobType);
  const url = escapeHTML(jobData.url);
  const jobId = escapeHTML(jobData.jobId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${company}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      border-bottom: 1px solid #eaeaea;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    h1 { font-size: 28px; margin-bottom: 5px; color: #0073b1; }
    h2 { font-size: 22px; margin-top: 30px; margin-bottom: 15px; color: #0073b1; }
    .company { font-size: 18px; font-weight: 500; color: #555; }
    .job-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      background-color: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .detail-item { margin-bottom: 10px; }
    .detail-label { font-weight: 600; color: #555; }
    .job-description {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #eaeaea;
    }
    .job-description ul, .job-description ol { padding-left: 25px; }
    a { color: #0073b1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer {
      margin-top: 30px;
      text-align: center;
      font-size: 14px;
      color: #777;
      border-top: 1px solid #eaeaea;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <div class="company">${company}</div>
  </header>

  <div class="job-details">
    <div class="detail-item">
      <div class="detail-label">Location</div>
      <div>${location}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Posted</div>
      <div>${posted}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Applicants</div>
      <div>${applicants}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Salary</div>
      <div>${salary}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Work Type</div>
      <div>${workType}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Job Type</div>
      <div>${jobType}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Source</div>
      <div><a href="${url}" target="_blank">LinkedIn Job Listing</a></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Job ID</div>
      <div>${jobId}</div>
    </div>
  </div>

  <h2>Job Description</h2>
  <div class="job-description">
    ${cleanDescription}
  </div>

  <footer>
    Downloaded on ${new Date().toLocaleString()} using LinkedIn Job Downloader
  </footer>
</body>
</html>`;
};
