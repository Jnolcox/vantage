/**
 * Install the Cyber sonar scene hook only while the Cyber HUD theme is
 * selected. The hook wraps the scene's primitive update and walks models on
 * every draw, so other themes must not load or run it. Leaving Cyber disposes
 * the hook, which restores native commands and model colors.
 */
export const CYBER_UI_THEME = 'cyber';
const UI_THEME_ATTRIBUTE = 'data-ui-theme';

const loadCyberSonarScene = () => import('./cyberSonarScene.js');

export function createCyberSonarSceneInstaller(
  viewer,
  manager,
  {
    root = globalThis.document?.documentElement,
    MutationObserverImpl = globalThis.MutationObserver,
    loadScene = loadCyberSonarScene,
    onError = (error) =>
      console.warn('[Vantage] Cyber sonar unavailable:', error),
  } = {},
) {
  if (!root?.dataset || typeof MutationObserverImpl !== 'function')
    return () => {};
  let disposeScene = null;
  let loading = null;
  let destroyed = false;

  const wanted = () => !destroyed && root.dataset.uiTheme === CYBER_UI_THEME;

  const uninstall = () => {
    if (!disposeScene) return;
    const dispose = disposeScene;
    disposeScene = null;
    dispose();
    viewer?.scene?.requestRender?.();
  };

  const sync = () => {
    if (!wanted()) {
      uninstall();
      return;
    }
    if (disposeScene || loading) return;
    loading = loadScene()
      .then(({ createCyberSonarScene }) => {
        // The theme is re-read here: it may have left (or left and returned)
        // while the module loaded.
        if (wanted() && !disposeScene) {
          disposeScene = createCyberSonarScene(viewer, manager);
          viewer?.scene?.requestRender?.();
        }
      })
      .catch(onError)
      .finally(() => {
        loading = null;
      });
  };

  const observer = new MutationObserverImpl(sync);
  observer.observe(root, {
    attributes: true,
    attributeFilter: [UI_THEME_ATTRIBUTE],
  });
  sync();

  return () => {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    uninstall();
  };
}
