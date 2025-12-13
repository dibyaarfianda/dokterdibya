import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dokterdibya.patient',
  appName: 'Dokter Dibya',
  webDir: 'www',

  // Server configuration - load from live URL
  server: {
    // Use the live patient portal URL
    url: 'https://dokterdibya.com/patient-dashboard.html',
    cleartext: false,
    // Allow navigation to these hosts
    allowNavigation: [
      'dokterdibya.com',
      '*.dokterdibya.com'
    ]
  },

  // Android specific config
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Set to true for debugging
    backgroundColor: '#1a1a2e'
  },

  // iOS specific config
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1a1a2e',
    preferredContentMode: 'mobile'
  },

  // Plugins configuration
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#0066FF'
    }
  }
};

export default config;
