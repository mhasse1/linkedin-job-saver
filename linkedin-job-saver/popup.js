document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('download-btn');
  const jobDetectedDiv = document.getElementById('job-detected');
  const noJobDiv = document.getElementById('no-job');
  const jobTitleSpan = document.querySelector('#job-title span');
  const companyNameSpan = document.querySelector('#company-name span');
  const statusDiv = document.getElementById('status');
  
  console.log("Popup opened");
  
  // Check if current tab is a LinkedIn job page
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    const tabId = currentTab.id;
    
    console.log("Current tab:", currentTab.url);
    
    // Check if we have stored job data for this tab
    chrome.storage.session.get([`tab_${tabId}_jobData`], function(result) {
      const jobData = result[`tab_${tabId}_jobData`];
      console.log("Retrieved stored job data:", jobData);
      
      if (jobData) {
        // We have stored data - job was detected
        jobDetectedDiv.style.display = 'block';
        noJobDiv.style.display = 'none';
        
        // Update job details
        jobTitleSpan.textContent = jobData.jobTitle || 'Unknown';
        companyNameSpan.textContent = jobData.companyName || 'Unknown';
        
        // Enable download button
        downloadBtn.disabled = false;
      } else {
        // No stored data - check if this is a LinkedIn job page
        if (currentTab.url.match(/linkedin\.com\/jobs\/view\/\d+/)) {
          showStatus('Job data not loaded yet. Please refresh the page.', 'info');
        }
        
        // Show the no-job UI
        noJobDiv.style.display = 'block';
        jobDetectedDiv.style.display = 'none';
      }
    });
  });
  
  // Handle download button click
  downloadBtn.addEventListener('click', function() {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    showStatus('Getting job details...', 'info');
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Make sure it's a LinkedIn job page
      if (!tabs[0].url.match(/linkedin\.com\/jobs\/view\/\d+/)) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Job Description';
        showStatus('Not a LinkedIn job page. Please navigate to a job listing.', 'error');
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, {action: "downloadJob"}, function(response) {
        // Check for runtime.lastError
        if (chrome.runtime.lastError) {
          console.log("Error downloading job:", chrome.runtime.lastError.message);
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download Job Description';
          showStatus('Error communicating with the page. Please refresh and try again.', 'error');
          return;
        }
        
        if (response && response.success) {
          showStatus('Job details extracted! Downloading file...', 'success');
          
          // Send to background script to create and download the HTML file
          chrome.runtime.sendMessage({
            action: "createAndDownloadHTML",
            jobData: response.jobData
          }, function(downloadResponse) {
            // Check for runtime.lastError
            if (chrome.runtime.lastError) {
              console.log("Error in background script:", chrome.runtime.lastError.message);
              downloadBtn.disabled = false;
              downloadBtn.textContent = 'Download Job Description';
              showStatus('Error downloading file. Please try again.', 'error');
              return;
            }
            
            if (downloadResponse && downloadResponse.success) {
              downloadBtn.textContent = 'Downloaded Successfully!';
              showStatus('Job details saved to your downloads folder.', 'success');
              
              // Reset button after 3 seconds
              setTimeout(function() {
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download Job Description';
                statusDiv.style.display = 'none';
              }, 3000);
            } else {
              downloadBtn.disabled = false;
              downloadBtn.textContent = 'Download Job Description';
              showStatus('Error downloading file: ' + ((downloadResponse && downloadResponse.error) || 'Unknown error'), 'error');
            }
          });
        } else {
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download Job Description';
          showStatus('Error extracting job details: ' + ((response && response.error) || 'Unknown error'), 'error');
        }
      });
    });
  });
  
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }
});