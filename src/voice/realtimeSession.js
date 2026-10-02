import { VantageRealtimeController } from './realtimeController.js';
import {
  readStoredViewImageSharing,
  writeStoredViewImageSharing,
} from './realtimePreferences.js';

const VIEW_IMAGE_TITLE_ON =
  'View image ON: voice turns may include a screenshot of the current view, sent to OpenAI. Click to stop sending it.';
const VIEW_IMAGE_TITLE_OFF =
  'View image OFF: voice uses map data only and sends no screenshot. Click to allow it.';

/** Reflect the stored view-image choice on its toggle. */
export function syncViewImageButton(button, enabled) {
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  button.textContent = enabled ? 'VIEW' : 'NO VIEW';
  button.title = enabled ? VIEW_IMAGE_TITLE_ON : VIEW_IMAGE_TITLE_OFF;
}

/** Adapt the existing WebRTC implementation to the common voice session. */
export function createRealtimeSession({
  emit,
  runAction,
  createController = (options) => new VantageRealtimeController(options),
  ...options
}) {
  const controller = createController({
    ...options,
    actionExecutor: runAction,
    onSessionEvent: emit,
  });
  return {
    controller,
    capabilities: { costControls: true, pushToTalk: true, viewImage: true },
    start: (settings) => controller.start(settings),
    stop: (settings) => controller.stop(settings),
    sendText: (text) => controller.sendTextCommand(text),
    sendMapEvent: (event) => controller.notifyMapEvent(event),
    ignoreButtonClick: () => Boolean(controller.spaceKeyHeld),
    bindControls() {
      if (controller.ui.tierButton) {
        controller.tierHandler = () => controller.toggleVoiceTier();
        controller.ui.tierButton.addEventListener(
          'click',
          controller.tierHandler,
        );
      }
      const viewImageButton = controller.ui.viewImageButton;
      if (viewImageButton && !viewImageButton.dataset.bound) {
        viewImageButton.dataset.bound = 'true';
        syncViewImageButton(viewImageButton, readStoredViewImageSharing());
        viewImageButton.addEventListener('click', () =>
          syncViewImageButton(
            viewImageButton,
            writeStoredViewImageSharing(!readStoredViewImageSharing()),
          ),
        );
      }
      controller.syncCostUi();
      controller.bindPushToTalkShortcut();
    },
  };
}
