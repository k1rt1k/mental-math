// Prints a fresh VAPID key pair for push notifications. Run once:  npm run vapid
// Then add the three values as environment variables in Netlify (Site settings → Environment variables) and redeploy.
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.com\n\nKeep the private key secret. Use your own email in VAPID_SUBJECT.\n`);
