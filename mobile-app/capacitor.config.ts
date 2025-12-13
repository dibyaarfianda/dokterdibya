import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dokterdibya.patient',
  appName: 'dokterDIBYA',
  webDir: 'www',

  // Use local www folder for login page
  // After login, redirects to live website
  server: {
    // Allow navigation to the live website after login
    allowNavigation: [
      'dokterdibya.com',
      '*.dokterdibya.com',
      'https://dokterdibya.com/*'
    ]
  },

  // Android specific config
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Set to true for debugging
    backgroundColor: '#0f0f1a'
  },

  // iOS specific config
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f0f1a',
    preferredContentMode: 'mobile'
  },

  // Plugins configuration
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f0f1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f0f1a'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#0066FF'
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '738335602560-52as846lk2oo78fr38a86elu8888m7eh.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    }
  }
};

export default config;
