async function init(): Promise<void> {
  const status = document.getElementById('status')!;
  const auth = await new Promise<{ authenticated: boolean }>((resolve) =>
    chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (r) => resolve(r))
  );
  status.textContent = auth.authenticated
    ? 'Signed in ✓'
    : 'Not signed in — log in at navratna.tardis.digital';

  document.getElementById('toggle')!.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
      window.close();
    }
  });
}

init();
