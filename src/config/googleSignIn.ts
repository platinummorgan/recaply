import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Web Client ID from Google Cloud Console
const WEB_CLIENT_ID = '903412447976-ck8a4q8ke67ilsaue2qfn50u8p78fpsh.apps.googleusercontent.com';
// iOS Client ID from Google Cloud Console
const IOS_CLIENT_ID = '903412447976-6o0br5v6uoj1t2ngoms7neu87seqkn1t.apps.googleusercontent.com';

const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';

let GoogleSignin: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  } catch {
    GoogleSignin = null;
  }
}

export const configureGoogleSignIn = () => {
  if (!GoogleSignin) {
    return;
  }

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' && { iosClientId: IOS_CLIENT_ID }),
    offlineAccess: true,
  });
};

export const isGoogleNativeSignInAvailable = Boolean(GoogleSignin);
export { GoogleSignin };
