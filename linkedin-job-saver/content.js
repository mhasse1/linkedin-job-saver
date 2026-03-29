// LinkedIn Job Downloader - Content Script
// Extracts job details from LinkedIn job pages

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[LJD:cs]', ...args); };

// ---------------------------------------------------------------------------
// Selector Configuration
// ---------------------------------------------------------------------------
// Centralized selectors make it easy to update when LinkedIn changes their DOM.
// Uses partial class matching, aria attributes, data-tracking attributes, and
// structural patterns for resilience against class name renames.

const SELECTORS = {
  jobTitle: {
    css: [
      'h1[class*="job-title"]',
      'h1[class*="top-card"] a',
      '.topcard__title',
      'h1.t-24',
      'h1'
    ],
    default: 'Unknown Position'
  },

  companyName: {
    css: [
      'a[class*="company-name"]',
      'div[class*="company-name"] a',
      'a[data-tracking-control-name*="company"]',
      '.topcard__org-name-link',
      'a[href*="/company/"]'
    ],
    filter: (el) => el.textContent.trim().length > 0 && el.textContent.trim().length < 100,
    default: 'Unknown Company'
  },

  infoLine: {
    css: [
      'div[class*="primary-description"]',
      'div[class*="subtitle-primary"]',
      '.job-card-container__primary-description'
    ]
  },

  insightLine: {
    css: [
      'div[class*="job-insight"]',
      'li[class*="job-insight"]',
      'div[class*="workplace-type"]'
    ]
  },

  jobDescription: {
    css: [
      'div[class*="jobs-description__content"]',
      'div[class*="jobs-description-content"]',
      '#job-details',
      'div[class*="jobs-box__html-content"]',
      '.description__text'
    ]
  },

  seeMoreButton: {
    css: [
      'button[aria-label*="see more" i]',
      'button[aria-label*="show more" i]',
      'button[class*="jobs-description__footer-button"]',
      'button[class*="show-more-less-html__button--more"]'
    ]
  },

  // Individual fallback selectors for location, posting time, applicants
  location: {
    css: [
      'span[class*="bullet"]',
      'span[class*="workplace-type"]',
      '.topcard__flavor'
    ]
  },

  postingTime: {
    css: [
      'span[class*="posted-date"]',
      'span[class*="posted-time"]',
      '.posted-time',
      '.topcard__flavor--metadata'
    ]
  },

  applicants: {
    css: [
      'span[class*="applicant-count"]',
      'span.num-applicants'
    ]
  },

  salary: {
    css: [
      'span[class*="job-insight"] span',
      'div[class*="job-insight"] span',
      '.salary-information',
      '.compensation'
    ]
  },

  workType: {
    css: [
      'span[class*="workplace-type"]',
      'span[data-tracking-control-name="workplace_type"]'
    ]
  },

  jobType: {
    css: [
      'span[class*="job-type"]',
      'span[data-tracking-control-name="job_type"]'
    ]
  }
};

// ---------------------------------------------------------------------------
// Generic extraction engine
// ---------------------------------------------------------------------------

/**
 * Try CSS selectors in order, return first matching text content.
 * Optional filter function to validate candidate elements.
 */
const extractField = (config, defaultValue = 'Not specified') => {
  for (const selector of config.css) {
    const el = document.querySelector(selector);
    if (el?.textContent.trim()) {
      if (config.filter && !config.filter(el)) continue;
      return el.textContent.trim();
    }
  }
  return config.default ?? defaultValue;
};

/**
 * Try CSS selectors, return the element itself (not text).
 */
const extractElement = (config) => {
  for (const selector of config.css) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
};

/**
 * Scan all elements of a given tag for text matching a predicate.
 */
const scanByText = (tag, predicate, maxLength = 70) => {
  for (const el of document.querySelectorAll(tag)) {
    const text = el.textContent.trim();
    if (text && text.length < maxLength && predicate(text.toLowerCase())) {
      return text;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

const getJobTitle = () => extractField(SELECTORS.jobTitle);

const getCompanyName = () => extractField(SELECTORS.companyName);

const getJobId = () => {
  const match = window.location.href.match(/\/jobs\/view\/(\d+)/);
  return match ? match[1] : 'Unknown';
};

const extractLocationPostingApplicants = () => {
  let location = 'Not specified';
  let whenPosted = 'Not specified';
  let applicants = 'Not specified';

  // Try composite info line first (parts separated by " · ")
  const infoEl = extractElement(SELECTORS.infoLine);
  const infoLine = infoEl?.textContent.trim();

  if (infoLine?.includes(' · ')) {
    const parts = infoLine.split(' · ').map(p => p.trim());
    if (parts[0]) location = parts[0];
    if (parts[1]) whenPosted = parts[1];
    if (parts[2]) applicants = parts[2];
  } else {
    // Individual fallbacks
    location = extractFieldWithTextScan(SELECTORS.location,
      text => text.includes(',') || /[A-Z][a-z]+, [A-Z]{2}/.test(text));

    whenPosted = extractFieldWithTextScan(SELECTORS.postingTime,
      text => /ago|day|hour|week|month|posted/i.test(text));

    applicants = extractFieldWithTextScan(SELECTORS.applicants,
      text => /applicant|application|clicked apply/i.test(text));
  }

  return { location, whenPosted, applicants };
};

/**
 * Try selectors, then fall back to scanning all spans by predicate.
 */
const extractFieldWithTextScan = (config, predicate, defaultValue = 'Not specified') => {
  // Try CSS selectors
  for (const selector of config.css) {
    for (const el of document.querySelectorAll(selector)) {
      const text = el.textContent.trim();
      if (text && predicate(text)) {
        return stripMatchesPref(text);
      }
    }
  }
  // Fallback: scan all spans
  const result = scanByText('span', t => predicate(t));
  return result ? stripMatchesPref(result) : defaultValue;
};

const stripMatchesPref = (text) =>
  text.includes('Matches your job preferences')
    ? text.split('Matches your job preferences')[0].trim()
    : text;

const extractSalaryWorkJobType = () => {
  let salaryRange = 'Not specified';
  let workType = 'Not specified';
  let jobType = 'Not specified';

  // Try composite insight line
  const insightEl = extractElement(SELECTORS.insightLine);
  let insightLine = insightEl?.textContent.trim() ?? '';
  insightLine = stripMatchesPref(insightLine);

  if (insightLine) {
    // Parse salary
    if (insightLine.includes('$') || insightLine.toLowerCase().includes('salary')) {
      const match = insightLine.match(/\$[\d,.]+(\/|\s*-\s*\$|\s*to\s*\$|\s*per\s*|\s*\+|K\/)/i);
      if (match) {
        const start = insightLine.indexOf(match[0]);
        let end = insightLine.length;
        for (const marker of ['  ', ' Remote', ' Hybrid', ' On-site', ' Full-time', ' Part-time']) {
          const pos = insightLine.indexOf(marker, start);
          if (pos !== -1 && pos < end) end = pos;
        }
        salaryRange = insightLine.substring(start, end).trim();
      }
    }

    // Parse work type
    for (const kw of ['Remote', 'Hybrid', 'On-site', 'Onsite']) {
      if (insightLine.includes(kw)) { workType = kw; break; }
    }

    // Parse job type
    for (const kw of ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship']) {
      if (insightLine.includes(kw)) { jobType = kw; break; }
    }
  }

  // Individual fallbacks
  if (salaryRange === 'Not specified') {
    salaryRange = extractFieldWithTextScan(SELECTORS.salary,
      text => text.includes('$') || /salary|pay|compensation/i.test(text));
  }
  if (workType === 'Not specified') {
    workType = extractFieldWithTextScan(SELECTORS.workType,
      text => /remote|hybrid|on-site|onsite/i.test(text));
  }
  if (jobType === 'Not specified') {
    jobType = extractFieldWithTextScan(SELECTORS.jobType,
      text => /full-time|part-time|contract|temporary|internship/i.test(text));
  }

  return { salaryRange, workType, jobType };
};

const extractJobDescription = () => {
  // Try configured selectors
  const el = extractElement(SELECTORS.jobDescription);
  if (el) return el.innerHTML;

  // Fallback: look for "About the job" / "Job description" headers
  for (const header of document.querySelectorAll('h2, h3')) {
    if (/about the job|job description|description/i.test(header.textContent)) {
      let parent = header.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        if (parent.innerHTML.length > 200) return parent.innerHTML;
        parent = parent.parentElement;
      }
    }
  }

  return 'No job description available.';
};

const extractJobData = () => {
  const { location, whenPosted, applicants } = extractLocationPostingApplicants();
  const { salaryRange, workType, jobType } = extractSalaryWorkJobType();

  return {
    jobTitle: getJobTitle(),
    companyName: getCompanyName(),
    jobId: getJobId(),
    url: window.location.href,
    location,
    whenPosted,
    applicants,
    salaryRange,
    workType,
    jobType,
    jobDescription: extractJobDescription(),
    timestamp: new Date().toISOString()
  };
};

// ---------------------------------------------------------------------------
// "See more" button handling with MutationObserver
// ---------------------------------------------------------------------------

const clickSeeMoreButton = () => {
  // Try configured selectors first
  for (const selector of SELECTORS.seeMoreButton.css) {
    const btn = document.querySelector(selector);
    if (btn?.offsetParent) {
      log('Clicking See more button via selector');
      btn.click();
      return true;
    }
  }

  // Fallback: scan all buttons by text
  for (const btn of document.querySelectorAll('button')) {
    const text = btn.textContent.toLowerCase();
    if (btn.offsetParent && (text.includes('see more') || text.includes('show more'))) {
      log('Clicking See more button via text scan');
      btn.click();
      return true;
    }
  }

  return false;
};

const waitForAndClickSeeMore = () => {
  if (clickSeeMoreButton()) return;

  const observer = new MutationObserver((_mutations, obs) => {
    if (clickSeeMoreButton()) obs.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Stop watching after 10 seconds
  setTimeout(() => observer.disconnect(), 10_000);
};

// ---------------------------------------------------------------------------
// Floating download button
// ---------------------------------------------------------------------------

const injectDownloadButton = () => {
  if (document.getElementById('linkedin-job-downloader-button')) return;

  const container = document.createElement('div');
  container.id = 'linkedin-job-downloader-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  `;

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

  button.onmouseover = () => { button.style.backgroundColor = '#005582'; };
  button.onmouseout = () => { button.style.backgroundColor = '#0073b1'; };

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

  const showStatus = (message, type) => {
    status.textContent = message;
    status.style.display = 'block';
    const colors = {
      error: { bg: '#f8d7da', fg: '#721c24' },
      success: { bg: '#d4edda', fg: '#155724' },
      info: { bg: '#cce5ff', fg: '#004085' }
    };
    const c = colors[type] ?? colors.info;
    status.style.backgroundColor = c.bg;
    status.style.color = c.fg;
  };

  const resetButton = () => {
    button.disabled = false;
    button.textContent = 'Download Job Description';
    button.style.backgroundColor = '#0073b1';
    downloading = false;
  };

  let downloading = false;

  button.onclick = () => {
    if (downloading) return;
    downloading = true;
    button.disabled = true;
    button.textContent = 'Downloading...';
    button.style.backgroundColor = '#999';
    showStatus('Getting job details...', 'info');

    try {
      const jobData = extractJobData();

      chrome.runtime.sendMessage(
        { action: 'createAndDownloadHTML', jobData },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Background script error:', chrome.runtime.lastError.message);
            showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
            resetButton();
            return;
          }

          if (response?.success) {
            showStatus('Downloaded successfully!', 'success');
            button.textContent = 'Downloaded!';
            setTimeout(() => {
              resetButton();
              status.style.display = 'none';
            }, 3000);
          } else {
            showStatus('Error: ' + (response?.error ?? 'Unknown error'), 'error');
            resetButton();
          }
        }
      );
    } catch (error) {
      console.error('Error downloading job:', error);
      showStatus('Error: ' + error.message, 'error');
      resetButton();
    }
  };

  container.appendChild(button);
  container.appendChild(status);
  document.body.appendChild(container);
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

log('LinkedIn Job Downloader initialized');

injectDownloadButton();

// Notify extension that we're on a job page
chrome.runtime.sendMessage({
  action: 'jobPageDetected',
  jobTitle: getJobTitle(),
  companyName: getCompanyName(),
  url: window.location.href
});

// Expand truncated job descriptions
waitForAndClickSeeMore();

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  log('Received message:', request.action);

  if (request.action === 'ping') {
    sendResponse({ pong: true });
  } else if (request.action === 'getJobDetails') {
    sendResponse({
      success: true,
      jobTitle: getJobTitle(),
      companyName: getCompanyName()
    });
  } else if (request.action === 'downloadJob') {
    try {
      sendResponse({ success: true, jobData: extractJobData() });
    } catch (error) {
      console.error('Error extracting job data:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  return true;
});
