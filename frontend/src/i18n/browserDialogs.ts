import { localizeMessage } from './message';

let installed = false;

export function installBrowserDialogLocalization() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);

  window.alert = (message?: unknown) => {
    nativeAlert(localizeMessage(message));
  };

  window.confirm = (message?: string) => nativeConfirm(localizeMessage(message));
}
