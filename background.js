// background.js (V2.2) - COMPLETE FILE

console.log('[BarebonesBgV2.2] Background script loaded.'); // Version marker

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getDownloadUrlFromPage(tabId, videoPageUrl) {
  console.log(`[BarebonesBgV2.2][Tab ${tabId}] Processing: ${videoPageUrl}`); // Version marker

  try {
    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Attempting to scroll page.`); // Version marker
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, 312)
    });
    await delay(500); 
  } catch (e) {
    console.warn(`[BarebonesBgV2.2][Tab ${tabId}] Scroll failed (continuing):`, e.message); // Version marker
  }

  // 1. Wait for and Click the initial "Download" button/link.
  let initialClickSuccessful = false;
  try {
    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Waiting for and attempting to click the initial 'Download' link.`); // Version marker
    const clickResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This is an IIFE Promise to allow async operations like polling
        return new Promise((resolve, reject) => {
          const initialButtonSelector = 'div.mt-2.download-btn a.pa-2.download-btn';
          let attempts = 0;
          const maxAttempts = 20; // Poll for up to 10 seconds (20 * 500ms) for the initial button

          console.log(`Script (poll-initial): Starting to poll for initial button: ${initialButtonSelector}`);

          const intervalId = setInterval(() => {
            const initialDownloadLink = document.querySelector(initialButtonSelector);
            
            if (initialDownloadLink && initialDownloadLink.textContent.trim().includes('Download')) {
              clearInterval(intervalId);
              console.log('Script (poll-initial): Found initial download link:', initialDownloadLink);
              initialDownloadLink.click(); // Perform the click
              // Basic check after click
              resolve({ clicked: true, visibleAfterClick: !!(initialDownloadLink.offsetParent !== null) });
              return;
            }
            
            attempts++;
            if (attempts >= maxAttempts) {
              clearInterval(intervalId);
              const buttonExists = !!document.querySelector(initialButtonSelector);
              const errorMsg = `Script (poll-initial): Initial "Download" link ('${initialButtonSelector}') not found after ${maxAttempts} attempts or text mismatch. (Button exists on page: ${buttonExists})`;
              console.error(errorMsg);
              if (buttonExists) {
                  console.log("Script (poll-initial timeout): Details of existing button found by selector:", document.querySelector(initialButtonSelector).outerHTML.substring(0,300));
              }
              reject(new Error(errorMsg)); // Reject the promise from within executeScript
            } else {
                // console.log(`Script (poll-initial attempt ${attempts}): Initial button not yet found or ready.`);
            }
          }, 500); // Poll every 500ms
        });
      }
    });

    // Check the result from the executeScript promise
    if (clickResults && clickResults[0] && clickResults[0].result && clickResults[0].result.clicked) {
      initialClickSuccessful = true;
      console.log(`[BarebonesBgV2.2][Tab ${tabId}] Programmatic initial 'Download' click executed. Visible after click (approx): ${clickResults[0].result.visibleAfterClick}. Waiting for final link to appear.`); // Version marker
    } else {
      // This path is taken if the promise from executeScript was rejected
      const reason = (clickResults && clickResults[0] && clickResults[0].error && clickResults[0].error.message) ? clickResults[0].error.message : "Unknown reason for initial click failure (promise rejected).";
      console.error(`[BarebonesBgV2.2][Tab ${tabId}] Programmatic initial 'Download' click FAILED. Reason: ${reason}`); // Version marker
      throw new Error(`Initial programmatic click failed: ${reason}`);
    }
    await delay(3000); // Delay after initial click
  } catch (e) {
    // This catch handles errors from chrome.scripting.executeScript itself or if the promise was rejected.
    const errorMessage = e.message || "Unknown error during initial click phase.";
    console.error(`[BarebonesBgV2.2][Tab ${tabId}] Error during initial 'Download' click phase: ${errorMessage}`); // Version marker
    if (e.stack) console.error(e.stack.substring(0, 500));
    throw new Error(`Error during initial 'Download' click phase: ${errorMessage}`); 
  }

  // Safeguard already existed, but now initialClickSuccessful relies on a resolved promise.
  if (!initialClickSuccessful) { 
      console.error(`[BarebonesBgV2.2][Tab ${tabId}] Safeguard: Initial click was not successful (initialClickSuccessful is false).`); // Version marker
      throw new Error("Safeguard: Initial click was not successful.");
  }

  // 2. Extract the href from the *final* download anchor (this part remains the same as V2.1)
  try {
    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Attempting to extract final download link href.`); // Version marker
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return new Promise((resolve, reject) => {
          const finalLinkSelector = 'a[href*="storage.pmvhaven.com"]';
          let attempts = 0;
          const maxAttempts = 30; 
          console.log(`Script (poll-final): Starting to poll for final link: ${finalLinkSelector}`);
          const intervalId = setInterval(() => {
            const linkElements = document.querySelectorAll(finalLinkSelector);
            let finalLinkElement = null;
            if (linkElements.length > 0) {
                console.log(`Script (poll-final attempt ${attempts+1}): Found ${linkElements.length} candidate(s) for '${finalLinkSelector}'.`);
            }
            for (let el of linkElements) {
                if (el.offsetParent !== null) { 
                    if (el.closest('div.mt-2.download-btn')) continue;
                    const buttonChild = el.querySelector('button');
                    if (buttonChild && buttonChild.textContent.includes('SOURCE')) {
                        finalLinkElement = el;
                        console.log(`Script (poll-final attempt ${attempts+1}): Found suitable 'SOURCE' link element (anchor):`, el.href);
                        break; 
                    }
                    if (!finalLinkElement) {
                        finalLinkElement = el;
                        console.log(`Script (poll-final attempt ${attempts+1}): Found potential (non-SOURCE) visible link element (anchor):`, el.href);
                    }
                }
            }
            if (finalLinkElement && finalLinkElement.href && finalLinkElement.href.startsWith('http')) {
              clearInterval(intervalId);
              console.log('Script (poll-final): Final download link successfully found and resolved:', finalLinkElement.href);
              resolve(finalLinkElement.href);
              return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
              clearInterval(intervalId);
              const linkExistsOnPage = !!document.querySelector(finalLinkSelector);
              const errorMsg = `Script (poll-final): Final download link ('${finalLinkSelector}') polling timed out after ${maxAttempts} attempts. (A link matching selector exists on page: ${linkExistsOnPage})`;
              console.error(errorMsg);
              if (linkExistsOnPage) {
                  const allMatching = document.querySelectorAll(finalLinkSelector);
                  allMatching.forEach((match, idx) => {
                      console.log(`Script (poll-final timeout): Details of existing link candidate ${idx+1}:`, match.outerHTML.substring(0, 300) + "...", `Visible (offsetParent): ${match.offsetParent !== null}`);
                  });
              }
              reject(new Error(errorMsg));
            }
          }, 500);
        });
      }
    });

    if (results && results[0] && results[0].result) {
      console.log(`[BarebonesBgV2.2][Tab ${tabId}] Successfully extracted download URL: ${results[0].result}`); // Version marker
      return results[0].result;
    } else {
      const rejectionReason = (results && results[0] && results[0].error && results[0].error.message) ? results[0].error.message : 'No result or unexpected result from final link extraction script.';
      console.error(`[BarebonesBgV2.2][Tab ${tabId}] Could not extract final download URL. Reason: ${rejectionReason}`); // Version marker
      throw new Error(`Could not extract final download URL. ${rejectionReason}`);
    }
  } catch (e) {
    console.error(`[BarebonesBgV2.2][Tab ${tabId}] Error during final download link extraction phase:`, e.message, e.stack ? e.stack.substring(0,300) : ''); // Version marker
    throw e;
  }
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadSelected' && msg.urls && msg.urls.length > 0) {
    sendResponse({ status: 'Processing started. Check background console.' });
    console.log(`[BarebonesBgV2.2] Received ${msg.urls.length} URLs to process.`); // Version marker

    (async () => {
      for (let i = 0; i < msg.urls.length; i++) {
        const videoUrl = msg.urls[i];
        console.log(`[BarebonesBgV2.2] ------ Starting URL ${i + 1}/${msg.urls.length}: ${videoUrl} ------`); // Version marker
        let tabId;
        try {
          const tab = await chrome.tabs.create({ url: videoUrl, active: false });
          tabId = tab.id;

          // Wait for tab to load (listen for 'complete' status)
          await new Promise((resolve, reject) => {
            const listener = (updatedTabId, changeInfo, tabInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.tabs.onRemoved.removeListener(removedTabListener); // Clean up removed listener
                    clearTimeout(timeoutId); // Clear the timeout
                    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Tab loaded successfully.`); // Version marker
                    resolve();
                }
            };
            const timeoutId = setTimeout(() => { // Timeout to prevent hanging indefinitely
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.onRemoved.removeListener(removedTabListener); // Clean up removed listener
                console.warn(`[BarebonesBgV2.2][Tab ${tabId}] Tab load timeout after 20s, proceeding anyway but might fail.`); // Version marker
                resolve(); // Resolve to proceed, failure will be caught by subsequent steps
            }, 20000); // 20s timeout for tab load

            // Handle cases where tab is removed before loading, or errors during load
            const removedTabListener = function(removedTabId) {
              if (removedTabId === tabId) {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.onRemoved.removeListener(removedTabListener); // Clean itself up
                clearTimeout(timeoutId);
                console.error(`[BarebonesBgV2.2][Tab ${tabId}] Tab was closed before loading completed.`); // Version marker
                reject(new Error(`Tab ${tabId} was closed before loading completed.`));
              }
            };
            chrome.tabs.onRemoved.addListener(removedTabListener);
            chrome.tabs.onUpdated.addListener(listener);
          });
          
          const actualDownloadUrl = await getDownloadUrlFromPage(tabId, videoUrl); // Calls the updated function

          if (actualDownloadUrl) {
            console.log(`[BarebonesBgV2.2][Tab ${tabId}] Initiating download for: ${actualDownloadUrl}`); // Version marker
            const urlParts = videoUrl.split('/');
            const videoIdFromUrl = urlParts[urlParts.length -1] || urlParts[urlParts.length -2] || 'video_file';
            const filenameSuffix = videoIdFromUrl.replace(/[^a-zA-Z0-9.-]/g, '_');
            
            chrome.downloads.download({
              url: actualDownloadUrl,
              filename: `pmvhaven_downloads/${filenameSuffix || 'download'}.mp4` // Basic filename, puts in a subfolder
            });
            console.log(`[BarebonesBgV2.2][Tab ${tabId}] Download command issued for ${actualDownloadUrl}`); // Version marker
          } else {
            // This path should ideally not be reached if errors are properly thrown and caught above.
            console.error(`[BarebonesBgV2.2][Tab ${tabId}] No download URL obtained for ${videoUrl}. This indicates an issue in error propagation.`); // Version marker
          }

        } catch (err) {
          console.error(`[BarebonesBgV2.2][Tab ${tabId || 'N/A'}] Failed processing ${videoUrl}:`, err.message, err.stack ? err.stack.substring(0,300) : ''); // Version marker
        } finally {
          if (tabId) {
            try {
                // Add a slightly longer delay to ensure download has a chance to start if there were issues
                await delay(2000); 
                // Check if tab still exists before trying to remove
                const currentTabInfo = await chrome.tabs.get(tabId).catch(() => null);
                if (currentTabInfo) {
                    await chrome.tabs.remove(tabId);
                    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Tab closed.`); // Version marker
                } else {
                    console.log(`[BarebonesBgV2.2][Tab ${tabId}] Tab already closed or does not exist, no removal needed.`);
                }
            } catch (e) { console.warn(`[BarebonesBgV2.2][Tab ${tabId}] Failed to close tab:`, e.message); } // Version marker
          }
          console.log(`[BarebonesBgV2.2] ------ Finished URL ${i + 1}/${msg.urls.length}: ${videoUrl} ------`); // Version marker
          if (i < msg.urls.length - 1) await delay(1500); // Small delay between processing URLs
        }
      }
      console.log('[BarebonesBgV2.2] All URLs processed.'); // Version marker
    })();
    return true; // Indicates async response
  }
  return false;
});
