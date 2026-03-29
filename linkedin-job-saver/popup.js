// LinkedIn Job Downloader - Popup Script

const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log('[LJD:popup]', ...args); };

document.addEventListener('DOMContentLoaded', async () => {
  const downloadBtn = document.getElementById('download-btn');
  const jobDetectedDiv = document.getElementById('job-detected');
  const noJobDiv = document.getElementById('no-job');
  const jobTitleSpan = document.querySelector('#job-title span');
  const companyNameSpan = document.querySelector('#company-name span');
  const statusDiv = document.getElementById('status');

  log('Popup opened');

  const showStatus = (message, type) => {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  };

  // Check current tab for job data
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log('Current tab:', currentTab.url);

  const result = await chrome.storage.session.get([`tab_${currentTab.id}_jobData`]);
  const jobData = result[`tab_${currentTab.id}_jobData`];
  log('Retrieved stored job data:', jobData);

  if (jobData) {
    jobDetectedDiv.style.display = 'block';
    noJobDiv.style.display = 'none';
    jobTitleSpan.textContent = jobData.jobTitle || 'Unknown';
    companyNameSpan.textContent = jobData.companyName || 'Unknown';
    downloadBtn.disabled = false;
  } else {
    if (currentTab.url?.match(/linkedin\.com\/jobs\/view\/\d+/)) {
      showStatus('Job data not loaded yet. Please refresh the page.', 'info');
    }
    noJobDiv.style.display = 'block';
    jobDetectedDiv.style.display = 'none';
  }

  // Download button handler
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    showStatus('Getting job details...', 'info');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.match(/linkedin\.com\/jobs\/view\/\d+/)) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download Job Description';
      showStatus('Not a LinkedIn job page. Please navigate to a job listing.', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'downloadJob' });

      if (!response?.success) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Job Description';
        showStatus('Error extracting job details: ' + (response?.error ?? 'Unknown error'), 'error');
        return;
      }

      showStatus('Job details extracted! Downloading file...', 'success');

      const downloadResponse = await chrome.runtime.sendMessage({
        action: 'createAndDownloadHTML',
        jobData: response.jobData
      });

      if (downloadResponse?.success) {
        downloadBtn.textContent = 'Downloaded Successfully!';
        showStatus('Job details saved to your downloads folder.', 'success');
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download Job Description';
          statusDiv.style.display = 'none';
        }, 3000);
      } else {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Job Description';
        showStatus('Error downloading file: ' + (downloadResponse?.error ?? 'Unknown error'), 'error');
      }
    } catch (error) {
      log('Error:', error);
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download Job Description';
      showStatus('Error communicating with the page. Please refresh and try again.', 'error');
    }
  });
});
