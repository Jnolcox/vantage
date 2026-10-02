/** Build the voice control independently of its connection backend. */
export function createVoiceControl({ reset = false } = {}) {
  let root = document.getElementById('vantage-voice-control');
  if (root && reset) {
    root.remove();
    root = null;
  }
  if (!root) {
    root = document.createElement('div');
    root.id = 'vantage-voice-control';
    root.dataset.status = 'idle';
    root.dataset.speaker = 'idle';
    root.innerHTML = `
      <div class="vantage-voice-heading">
        <div class="vantage-voice-kicker">AI AGENT</div>
        <div id="vantage-voice-status">OFF</div>
        <div class="vantage-voice-cost">
          <button id="vantage-voice-tier" class="vantage-voice-tier-btn" type="button" aria-pressed="false" title="Voice model tier — applies next session">STD</button>
          <button id="vantage-voice-view-image" class="vantage-voice-tier-btn" type="button" aria-pressed="true" hidden>VIEW</button>
          <span id="vantage-voice-cost-value" class="vantage-voice-cost-value" data-level="ok" title="Estimated session cost">~$0.00</span>
        </div>
      </div>
      <button id="vantage-voice-button" type="button" aria-label="Voice control — activate to toggle voice; hold Space to speak" aria-describedby="vantage-voice-help">
        <span class="vantage-mic-orbit"><img src="/mic.svg" alt="" /></span>
        <span class="vantage-mic-label">ON/OFF</span>
      </button>
      <div class="vantage-voice-visualizer" aria-hidden="true">
        ${Array.from({ length: 15 }, (_, index) => `<span style="--bar:${index}"></span>`).join('')}
      </div>
      <div class="vantage-voice-readout">
        <div id="vantage-voice-detail">VOICE STANDBY</div>
      </div>
      <div id="vantage-voice-help" class="vantage-voice-help-tray" role="tooltip">
        <span class="vantage-voice-help-kicker">VOICE CONTROL</span>
        <span class="vantage-voice-help-detail">Hold Space to speak · tap Space to activate focused controls</span>
        <span class="vantage-voice-help-privacy">Voice sends your audio, map context and, with VIEW on, a screenshot of the current view to OpenAI.</span>
      </div>
      <div class="vantage-voice-error-tray" role="alert" aria-live="assertive">
        <div class="vantage-voice-error-header">
          <span>VOICE SYSTEM ERROR</span>
          <button class="vantage-voice-error-dismiss" type="button">DISMISS</button>
        </div>
        <div id="vantage-voice-error-detail"></div>
        <div class="vantage-voice-error-hint">Check microphone permission and network access, then try again.</div>
      </div>
    `;
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      const locationBar = document.getElementById('location-bar');
      const controlPanel = document.getElementById('control-panel');
      commandDock.appendChild(root);
      if (locationBar) commandDock.insertBefore(locationBar, root);
      if (controlPanel) commandDock.appendChild(controlPanel);
    } else {
      document.body.appendChild(root);
    }
    root
      .querySelector('.vantage-voice-error-dismiss')
      ?.addEventListener('click', () => {
        root.classList.add('error-dismissed');
      });
  }
  return {
    root,
    button: root.querySelector('#vantage-voice-button'),
    buttonLabel: root.querySelector('.vantage-mic-label'),
    status: root.querySelector('#vantage-voice-status'),
    detail: root.querySelector('#vantage-voice-detail'),
    helpDetail: root.querySelector('.vantage-voice-help-detail'),
    errorDetail: root.querySelector('#vantage-voice-error-detail'),
    tierButton: root.querySelector('#vantage-voice-tier'),
    viewImageButton: root.querySelector('#vantage-voice-view-image'),
    costValue: root.querySelector('#vantage-voice-cost-value'),
  };
}
