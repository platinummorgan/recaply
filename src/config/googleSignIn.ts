import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Web Client ID from Google Cloud Console
const WEB_CLIENT_ID = '903412447976-ck8a4q8ke67ilsaue2qfn50u8p78fpsh.apps.googleusercontent.com';

export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
  });
};

export { GoogleSignin };
