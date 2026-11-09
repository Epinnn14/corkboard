/**
 * Desktop/phone notifications. They fire while corkboard is open (a tab, or the
 * installed app in the background); for reminders when it's closed, notes can
 * be added to the device calendar instead (see dates.ts → toIcs).
 */
export type Permission = NotificationPermission | 'unsupported';

export function permission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function askPermission(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options: NotificationOptions = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { tag } };
  try {
    // through the service worker when installed: works on Android and survives a hidden tab
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* fall back to a page notification */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
