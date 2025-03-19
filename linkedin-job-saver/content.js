// LinkedIn Job Downloader - Content Script
// This script runs on LinkedIn job pages and extracts job details

(function() {
  console.log("LinkedIn Job Downloader initialized");
  
  // Create and inject floating download button
  injectDownloadButton();
  
  // Notify the extension that we're on a job page
  chrome.runtime.sendMessage({
    action: "jobPageDetected",
    jobTitle: getJobTitle(),
    companyName: getCompanyName(),
    url: window.location.href
  });
  
  // Check if the see more button is present and click it
  setTimeout(function() {
    try {
      clickSeeMoreButton();
      
      // Reinject the button after clicking "See more" to ensure it's visible
      setTimeout(function() {
        injectDownloadButton();
      }, 1000);
    } catch (e) {
      console.log("Could not click 'See more' button:", e);
    }
  }, 2000);
  
  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Content script received message:", request.action);
    
    // Handle ping messages to check if content script is ready
    if (request.action === "ping") {
      console.log("Ping received, sending pong");
      sendResponse({ pong: true });
    }
    else if (request.action === "getJobDetails") {
      // Basic job details for popup display
      const jobTitle = getJobTitle();
      const companyName = getCompanyName();
      
      console.log("Sending job details:", jobTitle, companyName);
      sendResponse({
        success: true,
        jobTitle: jobTitle,
        companyName: companyName
      });
    } 
    else if (request.action === "downloadJob") {
      try {
        // Extract all job details
        const jobData = extractJobData();
        console.log("Job data extracted:", jobData);
        
        sendResponse({
          success: true,
          jobData: jobData
        });
      } catch (error) {
        console.error("Error extracting job data:", error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    }
    
    return true; // Keep the message channel open for async response
  });
})();

// Create and inject a floating download button on the page
function injectDownloadButton() {
  // Check if button already exists
  if (document.getElementById('linkedin-job-downloader-button')) {
    return;
  }
  
  // Create container
  const container = document.createElement('div');
  container.id = 'linkedin-job-downloader-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  `;
  
  // Create button
  const button = document.createElement('button');
  button.id = 'linkedin-job-downloader-button';
  button.textContent = 'Download Job Description';
  button.style.cssText = `
    background-color: #0073b1;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    transition: background-color 0.3s;
  `;
  
  // Add hover effect
  button.onmouseover = function() {
    this.style.backgroundColor = '#005582';
  };
  button.onmouseout = function() {
    this.style.backgroundColor = '#0073b1';
  };
  
  // Create status div (hidden initially)
  const status = document.createElement('div');
  status.id = 'linkedin-job-downloader-status';
  status.style.cssText = `
    margin-top: 10px;
    padding: 10px;
    border-radius: 4px;
    font-size: 14px;
    display: none;
    text-align: center;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  `;
  
  // Add click handler
  button.onclick = function() {
    // Change button state
    button.disabled = true;
    button.textContent = 'Downloading...';
    button.style.backgroundColor = '#999';
    
    // Show status
    showStatus('Getting job details...', 'info');
    
    try {
      // Extract job data
      const jobData = extractJobData();
      
      // Send to background script to create and download HTML
      chrome.runtime.sendMessage({
        action: "createAndDownloadHTML",
        jobData: jobData
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error in background script:", chrome.runtime.lastError.message);
          showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          resetButton();
          return;
        }
        
        if (response && response.success) {
          showStatus('Downloaded successfully!', 'success');
          button.textContent = 'Downloaded!';
          
          // Reset button after 3 seconds
          setTimeout(function() {
            resetButton();
            hideStatus();
          }, 3000);
        } else {
          showStatus('Error downloading file: ' + ((response && response.error) || 'Unknown error'), 'error');
          resetButton();
        }
      });
      
    } catch (error) {
      console.error("Error downloading job:", error);
      showStatus('Error: ' + error.message, 'error');
      resetButton();
    }
  };
  
  function resetButton() {
    button.disabled = false;
    button.textContent = 'Download Job Description';
    button.style.backgroundColor = '#0073b1';
  }
  
  function showStatus(message, type) {
    status.textContent = message;
    status.style.display = 'block';
    
    if (type === 'error') {
      status.style.backgroundColor = '#f8d7da';
      status.style.color = '#721c24';
    } else if (type === 'success') {
      status.style.backgroundColor = '#d4edda';
      status.style.color = '#155724';
    } else {
      status.style.backgroundColor = '#cce5ff';
      status.style.color = '#004085';
    }
  }
  
  function hideStatus() {
    status.style.display = 'none';
  }
  
  // Assemble and add to page
  container.appendChild(button);
  container.appendChild(status);
  document.body.appendChild(container);
}

// Extract job data from the page
function extractJobData() {
  // Basic job information
  const jobTitle = getJobTitle();
  const companyName = getCompanyName();
  const jobId = getJobId();
  const url = window.location.href;
  
  // Get detailed job information
  const locationPostingApplicants = extractLocationPostingApplicants();
  const salaryWorkJobType = extractSalaryWorkJobType();
  
  // Job description
  const jobDescription = extractJobDescription();
  
  // Combine all data
  return {
    jobTitle: jobTitle,
    companyName: companyName,
    jobId: jobId,
    url: url,
    location: locationPostingApplicants.location,
    whenPosted: locationPostingApplicants.whenPosted,
    applicants: locationPostingApplicants.applicants,
    salaryRange: salaryWorkJobType.salaryRange,
    workType: salaryWorkJobType.workType,
    jobType: salaryWorkJobType.jobType,
    jobDescription: jobDescription,
    timestamp: new Date().toISOString()
  };
}

// Get the job title
function getJobTitle() {
  const selectors = [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.topcard__title',
    'h1.t-24',
    'h1'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return "Unknown Position";
}

// Get the company name
function getCompanyName() {
  const selectors = [
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.jobs-top-card__company-url',
    '.topcard__org-name-link',
    'a[data-tracking-control-name="public_jobs_topcard-org-name"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return "Unknown Company";
}

// Get the job ID from the URL
function getJobId() {
  const match = window.location.href.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : "Unknown";
}

// Extract location, posting time, and applicants information
function extractLocationPostingApplicants() {
  let location = "Not specified";
  let whenPosted = "Not specified";
  let applicants = "Not specified";
  
  // Try to find the info line
  const infoLineSelectors = [
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.jobs-unified-top-card__primary-description',
    '.job-details-jobs-unified-top-card__subtitle-primary-grouping',
    '.job-card-container__primary-description',
    '.jobs-unified-top-card__subtitle-primary'
  ];
  
  let infoLine = null;
  for (const selector of infoLineSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      infoLine = element.textContent.trim();
      if (infoLine.includes(" · ")) {
        break;
      }
    }
  }
  
  if (infoLine && infoLine.includes(" · ")) {
    // Split the info line by the separator " · "
    const parts = infoLine.split(" · ").map(part => part.trim());
    
    // First part is usually the location
    if (parts.length >= 1) {
      location = parts[0];
    }
    
    // Second part is usually when it was posted
    if (parts.length >= 2) {
      whenPosted = parts[1];
    }
    
    // Third part is usually the applicants count
    if (parts.length >= 3) {
      applicants = parts[2];
    }
  } else {
    // Try individual selectors if info line not found
    location = extractLocation();
    whenPosted = extractPostingTime();
    applicants = extractApplicantsInfo();
  }
  
  return { location, whenPosted, applicants };
}

// Extract location information
function extractLocation() {
  const locationSelectors = [
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__subtitle-primary',
    '.topcard__flavor',
    '.topcard__flavor--bullet'
  ];
  
  for (const selector of locationSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.includes(',') || text.match(/[A-Z][a-z]+, [A-Z]{2}/))) {
        return text;
      }
    }
  }
  
  return "Not specified";
}

// Extract posting time information
function extractPostingTime() {
  const timeSelectors = [
    '.jobs-unified-top-card__subtitle-secondary-grouping span',
    '.posted-time',
    '.topcard__flavor--metadata',
    '.job-posting-time',
    '.job-details-jobs-unified-top-card__posted-date',
    'span[data-tracking-control-name="public_jobs_posted-date"]'
  ];
  
  for (const selector of timeSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.includes('ago') || text.includes('day') || text.includes('hour') ||
                   text.includes('week') || text.includes('month') || text.includes('posted'))) {
        return text;
      }
    }
  }
  
  // Try finding any span with posting time keywords
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim().toLowerCase();
    if ((text.includes('ago') || text.includes('day') || text.includes('hour') ||
         text.includes('week') || text.includes('month') || text.includes('posted')) && 
        text.length < 50) {
      return span.textContent.trim();
    }
  }
  
  return "Not specified";
}

// Extract applicants information
function extractApplicantsInfo() {
  const applicantSelectors = [
    '.jobs-unified-top-card__subtitle-secondary-grouping span',
    '.applicants',
    '.topcard__flavor--metadata',
    'span.num-applicants',
    '.jobs-unified-top-card__applicant-count',
    '.jobs-details-jobs-unified-top-card__applicant-count'
  ];
  
  for (const selector of applicantSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.includes('applicant') || text.includes('application') || 
                   text.includes('clicked apply'))) {
        return text;
      }
    }
  }
  
  // Try finding any span with applicant keywords
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim().toLowerCase();
    if ((text.includes('applicant') || text.includes('application') || 
         text.includes('clicked apply')) && text.length < 70) {
      return span.textContent.trim();
    }
  }
  
  return "Not specified";
}

// Extract salary, work type, and job type
function extractSalaryWorkJobType() {
  let salaryRange = "Not specified";
  let workType = "Not specified";
  let jobType = "Not specified";
  
  // Try to find the insight line
  const insightLineSelectors = [
    '.job-details-jobs-unified-top-card__job-insight-container',
    '.jobs-unified-top-card__job-insight',
    '.job-details-jobs-unified-top-card__workplace-type',
    '.job-card-container__metadata-item',
    '.jobs-unified-top-card__job-insight-container'
  ];
  
  let insightLine = null;
  for (const selector of insightLineSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      insightLine = element.textContent.trim();
      if (insightLine.includes("Matches your job preferences")) {
        insightLine = insightLine.split("Matches your job preferences")[0].trim();
      }
      break;
    }
  }
  
  if (insightLine) {
    // Parse salary range
    if (insightLine.includes('$') || insightLine.toLowerCase().includes('salary')) {
      const salaryPattern = /\$[\d,.]+(\/|\s*-\s*\$|\s*to\s*\$|\s*per\s*|\s*\+|K\/)/i;
      const match = insightLine.match(salaryPattern);
      if (match) {
        const salaryStart = insightLine.indexOf(match[0]);
        let salaryEnd = insightLine.length;
        
        const markers = ["  ", " Remote", " Hybrid", " On-site", " Full-time", " Part-time"];
        for (const marker of markers) {
          const pos = insightLine.indexOf(marker, salaryStart);
          if (pos !== -1 && pos < salaryEnd) {
            salaryEnd = pos;
          }
        }
        
        salaryRange = insightLine.substring(salaryStart, salaryEnd).trim();
      }
    }
    
    // Parse work type
    const workTypeKeywords = ['Remote', 'Hybrid', 'On-site', 'Onsite'];
    for (const keyword of workTypeKeywords) {
      if (insightLine.includes(keyword)) {
        workType = keyword;
        break;
      }
    }
    
    // Parse job type
    const jobTypeKeywords = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship'];
    for (const keyword of jobTypeKeywords) {
      if (insightLine.includes(keyword)) {
        jobType = keyword;
        break;
      }
    }
  }
  
  // Try individual elements if insight line parsing failed
  if (salaryRange === "Not specified") {
    salaryRange = extractSalaryRange();
  }
  
  if (workType === "Not specified") {
    workType = extractWorkType();
  }
  
  if (jobType === "Not specified") {
    jobType = extractJobType();
  }
  
  return { salaryRange, workType, jobType };
}

// Extract salary range
function extractSalaryRange() {
  const salarySelectors = [
    '.job-details-jobs-unified-top-card__job-insight span',
    '.jobs-unified-top-card__job-insight span',
    '.salary-information',
    '.compensation',
    '.job-details-jobs-unified-top-card__job-insight-container'
  ];
  
  for (const selector of salarySelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.includes('$') || text.toLowerCase().includes('salary') ||
                 text.toLowerCase().includes('pay') || text.toLowerCase().includes('compensation'))) {
        if (text.includes("Matches your job preferences")) {
          return text.split("Matches your job preferences")[0].trim();
        }
        return text;
      }
    }
  }
  
  // Try any span with $ sign
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim();
    if (text.includes('$') && text.length < 100) {
      if (text.includes("Matches your job preferences")) {
        return text.split("Matches your job preferences")[0].trim();
      }
      return text;
    }
  }
  
  return "Not specified";
}

// Extract work type
function extractWorkType() {
  const workTypeSelectors = [
    '.job-details-jobs-unified-top-card__workplace-type',
    '.jobs-unified-top-card__workplace-type',
    '.workplace-type',
    'span.job-details-jobs-unified-top-card__workplace-type',
    'span[data-tracking-control-name="workplace_type"]'
  ];
  
  for (const selector of workTypeSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.toLowerCase().includes('remote') || text.toLowerCase().includes('hybrid') ||
                 text.toLowerCase().includes('on-site') || text.toLowerCase().includes('onsite'))) {
        if (text.includes("Matches your job preferences")) {
          return text.split("Matches your job preferences")[0].trim();
        }
        return text;
      }
    }
  }
  
  // Try any span with work type keywords
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim().toLowerCase();
    if ((text.includes('remote') || text.includes('hybrid') || 
         text.includes('on-site') || text.includes('onsite')) && text.length < 50) {
      const originalText = span.textContent.trim();
      if (originalText.includes("Matches your job preferences")) {
        return originalText.split("Matches your job preferences")[0].trim();
      }
      return originalText;
    }
  }
  
  return "Not specified";
}

// Extract job type
function extractJobType() {
  const jobTypeSelectors = [
    '.job-details-jobs-unified-top-card__job-type',
    '.jobs-unified-top-card__job-type',
    'span[data-tracking-control-name="job_type"]'
  ];
  
  for (const selector of jobTypeSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent.trim();
      if (text && (text.toLowerCase().includes('full-time') || text.toLowerCase().includes('part-time') || 
                  text.toLowerCase().includes('contract') || text.toLowerCase().includes('temporary') ||
                  text.toLowerCase().includes('internship'))) {
        if (text.includes("Matches your job preferences")) {
          return text.split("Matches your job preferences")[0].trim();
        }
        return text;
      }
    }
  }
  
  // Try any span with job type keywords
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent.trim().toLowerCase();
    if ((text.includes('full-time') || text.includes('part-time') || 
         text.includes('contract') || text.includes('temporary') ||
         text.includes('internship')) && text.length < 50) {
      const originalText = span.textContent.trim();
      if (originalText.includes("Matches your job preferences")) {
        return originalText.split("Matches your job preferences")[0].trim();
      }
      return originalText;
    }
  }
  
  return "Not specified";
}

// Click the "See more" button to expand job description
function clickSeeMoreButton() {
  const seeMoreSelectors = [
    'button.jobs-description__footer-button',
    'button.jobs-description__see-more-button',
    'button.show-more-less-html__button',
    'button.show-more-less-html__button--more',
    'button.artdeco-button.artdeco-button--muted',
    "button[aria-label='Click to see more description']"
  ];
  
  for (const selector of seeMoreSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      if (button.offsetParent !== null && 
          (button.textContent.toLowerCase().includes('see more') || 
           button.textContent.toLowerCase().includes('show more'))) {
        console.log("Clicking 'See more' button");
        button.click();
        return true;
      }
    }
  }
  
  // Try a more general approach
  const allButtons = document.querySelectorAll('button');
  for (const button of allButtons) {
    if (button.offsetParent !== null && 
        (button.textContent.toLowerCase().includes('see more') || 
         button.textContent.toLowerCase().includes('show more'))) {
      console.log("Clicking 'See more' button (general method)");
      button.click();
      return true;
    }
  }
  
  console.log("No 'See more' button found");
  return false;
}

// Extract job description
function extractJobDescription() {
  const descriptionSelectors = [
    '.jobs-description__content',
    '.jobs-description-content',
    '#job-details',
    '.jobs-box__html-content',
    '.description__text'
  ];
  
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerHTML;
    }
  }
  
  // Try looking for "About the job" section
  const headers = document.querySelectorAll('h2, h3');
  for (const header of headers) {
    if (header.textContent.includes('About the job') || 
        header.textContent.includes('Job description') ||
        header.textContent.includes('Description')) {
      let parent = header.parentElement;
      for (let i = 0; i < 3; i++) {
        if (parent && parent.innerHTML.length > 200) {
          return parent.innerHTML;
        }
        parent = parent.parentElement;
      }
    }
  }
  
  return "No job description available.";
}