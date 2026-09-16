import { useEffect, useRef } from 'react'

/**
 * useWakeLock
 *
 * Keeps the mobile screen awake while active (e.g. waiting in lobby or playing).
 * Automatically releases the lock when disabled or on unmount, and re-acquires
 * the lock when the page returns to foreground (visibilitychange).
 */
export function useWakeLock(enabled = true) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return undefined
    }

    let isMounted = true

    const requestLock = async () => {
      // Don't request if document is hidden or already holding an active lock
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      if (sentinelRef.current) return

      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (!isMounted) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
          }
        })
      } catch {
        // WakeLock request can fail gracefully due to battery saver, permission, or focus
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestLock()
      }
    }

    requestLock()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      isMounted = false
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {})
        sentinelRef.current = null
      }
    }
  }, [enabled])
}
