async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push not supported on this device/browser yet.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const reg = await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'BEz-RQJ9Krggi13aFiu2veQEuqNvDbkKn7CrJgPN6MBPJib2oU2jOW8Z6x28dSoegUe0GrOJmkj-UpcB9POtpvU'
  });

  console.log('PUSH SUBSCRIPTION:', JSON.stringify(sub));
}
