import { useAppContext } from 'components/AppContextProvider'
import { NotificationCardsWrapper } from 'components/notifications/NotificationCardsWrapper'
import { NotificationsError } from 'components/notifications/NotificationsError'
import { NOTIFICATION_CHANGE, NotificationChange } from 'features/notifications/notificationChange'
import { useObservable } from 'helpers/observableHook'
import { useUIChanges } from 'helpers/uiChangesHook'
import { useTranslation } from 'next-i18next'
import React, { useEffect, useMemo, useState } from 'react'
import { theme } from 'theme'
import { Box, Grid } from 'theme-ui'
import { useOnMobile } from 'theme/useBreakpointIndex'

import { NotificationsCenterContent } from './NotificationsCenterContent'
import { NotificationsCenterHeader } from './NotificationsCenterHeader'
import { NotificationPreferenceCardWrapper } from './NotificationsPrefrenceCardWrapper'

export function NotificationsCenter({ isOpen }: { isOpen: boolean }) {
  const onMobile = useOnMobile()
  const [showPreferencesTab, setShowPrefencesTab] = useState(false)
  const [notificationsState] = useUIChanges<NotificationChange>(NOTIFICATION_CHANGE)
  const { context$ } = useAppContext()
  const [context] = useObservable(context$)
  const { t } = useTranslation()

  const account = context?.status === 'connected' ? context.account : ''

  const notificationCenterStyles = useMemo(
    () => ({
      right: onMobile ? '8px' : '0',
      width: onMobile ? '95%' : 380,
    }),
    [onMobile],
  )

  useEffect(() => {
    setShowPrefencesTab(false)
  }, [account])

  return (
    <Box
      sx={{
        bg: 'white',
        position: 'absolute',
        mt: 2,
        borderRadius: '24px',
        boxShadow: theme.shadows.vaultDetailsCard,
        py: 24,
        px: 3,
        // TODO: Needs to be calculated but possibly be easier to get designers to adapt to this as its simpler from dev perspective & looks just as good
        ...notificationCenterStyles,
        transition: 'transform 0.3s ease-in-out',
        transform: !isOpen ? 'translateX(400%)' : 'translateX(0)',
        visibility: isOpen ? 'visible' : 'hidden',
      }}
    >
      <NotificationsCenterHeader
        onButtonClick={() => setShowPrefencesTab(!showPreferencesTab)}
        showPreferencesTab={showPreferencesTab}
      />
      {notificationsState?.error && (
        <Box my={2}>
          <NotificationsError text={t('notifications.service-not-available')} />
        </Box>
      )}
      {!!notificationsState && (
        <NotificationsCenterContent>
          <Grid sx={{ px: 2, mt: 3, mb: 2 }}>
            {showPreferencesTab ? (
              <NotificationPreferenceCardWrapper account={account} />
            ) : (
              <NotificationCardsWrapper account={account} />
            )}
          </Grid>
        </NotificationsCenterContent>
      )}
    </Box>
  )
}
