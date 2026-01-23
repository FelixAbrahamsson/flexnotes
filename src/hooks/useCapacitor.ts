import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// Check if running in native app
export const isNative = Capacitor.isNativePlatform()
export const isIOS = Capacitor.getPlatform() === 'ios'
export const isAndroid = Capacitor.getPlatform() === 'android'

// Initialize Capacitor plugins
export function useCapacitorInit() {
  useEffect(() => {
    if (!isNative) return

    const init = async () => {
      // Configure status bar
      try {
        await StatusBar.setStyle({ style: Style.Light })
        if (isAndroid) {
          await StatusBar.setBackgroundColor({ color: '#ffffff' })
        }
      } catch (e) {
        console.warn('StatusBar not available:', e)
      }

      // Configure keyboard
      try {
        if (isIOS) {
          await Keyboard.setScroll({ isDisabled: false })
        }
      } catch (e) {
        console.warn('Keyboard not available:', e)
      }

      // Hide splash screen
      try {
        await SplashScreen.hide()
      } catch (e) {
        console.warn('SplashScreen not available:', e)
      }
    }

    init()
  }, [])
}

// Haptic feedback utilities
export async function hapticLight() {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics not available
  }
}

export async function hapticMedium() {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    // Haptics not available
  }
}

export async function hapticHeavy() {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch {
    // Haptics not available
  }
}

// Hook to handle keyboard visibility (for adjusting UI)
export function useKeyboardVisibility(callback: (visible: boolean, height: number) => void) {
  useEffect(() => {
    if (!isNative) return

    const showListener = Keyboard.addListener('keyboardWillShow', info => {
      callback(true, info.keyboardHeight)
    })

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      callback(false, 0)
    })

    return () => {
      showListener.then(l => l.remove())
      hideListener.then(l => l.remove())
    }
  }, [callback])
}
