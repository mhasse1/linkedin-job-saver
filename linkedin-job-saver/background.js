// LinkedIn Job Downloader - Background Script
// Handles file creation and download functionality

// Set up a listener for when a tab is updated
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // Check if the URL matches a LinkedIn job page and the page has finished loading
  if (changeInfo.status === 'complete' && tab.url && tab.url.match(/linkedin\.com\/jobs\/view\/\d+/)) {
    console.log("LinkedIn job page detected in tab:", tabId);
    
    // Set badge to indicate a job is detected
    chrome.action.setBadgeText({ text: "JOB", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#0A66C2", tabId: tabId });
    
    // Store the URL for this tab (useful for popup)
    chrome.storage.session.set({
      [`tab_${tabId}_url`]: tab.url
    });
  }
});

// Listen for messages from content script about job page detection
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === "jobPageDetected") {
    console.log("Job page detection message received:", message);
    
    // Set badge to indicate a job is detected
    if (sender.tab) {
      chrome.action.setBadgeText({ text: "JOB", tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#0A66C2", tabId: sender.tab.id });
      
      // Store job data in tab-specific storage for the popup
      chrome.storage.session.set({
        [`tab_${sender.tab.id}_jobData`]: {
          jobTitle: message.jobTitle,
          companyName: message.companyName,
          url: message.url,
          tabId: sender.tab.id
        }
      });
    }
    
    sendResponse({ success: true, message: "Job page detection acknowledged" });
  }
  
  if (message.action === "createAndDownloadHTML") {
    try {
      const jobData = message.jobData;
      console.log("Creating HTML file for", jobData.companyName, "-", jobData.jobTitle);
      
      // Generate HTML content
      const htmlContent = formatJobAsHTML(jobData);
      
      // Create file name
      const fileName = sanitizeFileName(`${jobData.companyName}-${jobData.jobTitle}.html`);
      
      // Use data URL approach instead of Blob + URL.createObjectURL
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
      
      // Download the file using data URL
      chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: false
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          console.error("Download failed:", chrome.runtime.lastError);
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message
          });
        } else {
          console.log("Download started with ID:", downloadId);
          sendResponse({
            success: true,
            downloadId: downloadId
          });
        }
      });
      
      return true; // Keep the message channel open for async response
    } catch (error) {
      console.error("Error creating file:", error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  
  return true; // Keep the message channel open for async response
});

// Sanitize filename to avoid invalid characters
function sanitizeFileName(name) {
  // Remove special characters and replace spaces with hyphens
  return name.replace(/[<>:"/\\|?*]/g, '')
             .replace(/\s+/g, '-')
             .substring(0, 100); // Limit length to avoid overly long filenames
}

// Create HTML file with nice styling
function formatJobAsHTML(jobData) {
  // Clean the HTML
  const cleanDescription = cleanJobDescriptionHTML(jobData.jobDescription);
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${jobData.companyName} - ${jobData.jobTitle}</title>
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
    h1 {
      font-size: 28px;
      margin-bottom: 5px;
      color: #0073b1;
    }
    h2 {
      font-size: 22px;
      margin-top: 30px;
      margin-bottom: 15px;
      color: #0073b1;
    }
    .company {
      font-size: 18px;
      font-weight: 500;
      color: #555;
    }
    .job-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      background-color: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .detail-item {
      margin-bottom: 10px;
    }
    .detail-label {
      font-weight: 600;
      color: #555;
    }
    .job-description {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #eaeaea;
    }
    .job-description ul, .job-description ol {
      padding-left: 25px;
    }
    a {
      color: #0073b1;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .highlight {
      background-color: #e7f3ff;
      padding: 2px 5px;
      border-radius: 3px;
    }
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
    <h1>${jobData.jobTitle}</h1>
    <div class="company">${jobData.companyName}</div>
  </header>
  
  <div class="job-details">
    <div class="detail-item">
      <div class="detail-label">Location</div>
      <div>${jobData.location}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Posted</div>
      <div>${jobData.whenPosted}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Applicants</div>
      <div>${jobData.applicants}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Salary</div>
      <div>${jobData.salaryRange}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Work Type</div>
      <div>${jobData.workType}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Job Type</div>
      <div>${jobData.jobType}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Source</div>
      <div><a href="${jobData.url}" target="_blank">LinkedIn Job Listing</a></div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Job ID</div>
      <div>${jobData.jobId}</div>
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
  
  return html;
}

// Clean and improve the job description HTML
function cleanJobDescriptionHTML(html) {
  if (!html || html === "No job description available.") {
    return "<p>No job description available.</p>";
  }
  
  // Basic cleaning with regex
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/onclick="[^"]*"/gi, '')
    .replace(/onload="[^"]*"/gi, '')
    .replace(/onerror="[^"]*"/gi, '')
    .replace(/(href|src)="javascript:[^"]*"/gi, '$1="#"')
    .replace(/<a\s+/gi, '<a target="_blank" rel="noopener noreferrer" ');
}