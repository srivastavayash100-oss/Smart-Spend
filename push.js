const messaging = firebase.messaging();

navigator.serviceWorker.register('/Smart-Spend/firebase-messaging-sw.js');

async function enablePush() {
  if (!('Notification' in window)) {
    alert('Notifications not supported on this device/browser.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  try {
    const token = await messaging.getToken({
      vapidKey: 'BEz-RQJ9Krggi13aFiu2veQEuqNvDbkKn7CrJgPN6MBPJib2oU2jOW8Z6x28dSoegUe0GrOJmkj-UpcB9POtpvU'
    });

    console.log('FCM TOKEN:', token);
  } catch (err) {
    console.error('Error getting FCM token', err);
  }
}
