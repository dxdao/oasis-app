import BigNumber from 'bignumber.js'
import { useAppContext } from 'components/AppContextProvider'
import { Banner } from 'components/Banner'
import { useObservable } from 'helpers/observableHook'
import moment from 'moment'
import React, { useEffect, useMemo, useState } from 'react'
import { CountdownCircleTimer } from 'react-countdown-circle-timer'
import { Box, Flex, Heading, Text, useThemeUI } from 'theme-ui'

type VaultBannerProps = {
  status: JSX.Element
  header: JSX.Element | string
  subheader: JSX.Element | string
}

export function VaultBanner({
  status,
  header,
  subheader,
  color,
}: VaultBannerProps & { color: string }) {
  const [isVisible, setIsVisible] = useState(true)

  return (
    <>
      {isVisible && (
        <Banner close={() => setIsVisible(false)}>
          <Flex sx={{ py: 2, pr: 5 }}>
            <Box sx={{ mr: 4 }}>{status}</Box>
            <Box>
              <Heading as="h3" sx={{ mb: 2, color }}>
                {header}
              </Heading>
              <Text variant="subheader">{subheader}</Text>
            </Box>
          </Flex>
        </Banner>
      )}
    </>
  )
}

export function VaultWarningBanner({
  id,
  token,
  dateNextCollateralPrice,
}: {
  id: string
  token: string
  dateNextCollateralPrice: Date | undefined
}) {
  return (
    <VaultBanner
      status={useMemo(
        () => (
          <VaultNextPriceUpdateCounter
            nextPriceUpdateDate={dateNextCollateralPrice!}
            threshold={120}
            thresholdReachedLabel={
              <Box sx={{ textAlign: 'center' }}>
                <Heading
                  as="h3"
                  sx={{ lineHeight: 'tight', fontWeight: 'semiBold', color: 'banner.warning' }}
                >
                  {'<2'}
                </Heading>
                <Text sx={{ lineHeight: 'tight', fontSize: 1, color: 'mutedAlt' }}>mins</Text>
              </Box>
            }
          />
        ),
        [dateNextCollateralPrice!],
      )}
      header={`${token.toUpperCase()} Vault #${id} about to get liquidated`}
      subheader={`
        The next price will cause a liquidation on this Vault. You can still save your Vault from
        liquidation by adding collateral or pay back DAI.
      `}
      color="banner.warning"
    />
  )
}

export function VaultDangerBanner(props: VaultBannerProps) {
  return <VaultBanner {...props} color="banner.danger" />
}

interface VaultNextPriceUpdateCounterProps {
  nextPriceUpdateDate: Date
  // Once the counter reaches the threshold it is marked as completed and not more values are updated.
  // Substracts the seconds for the nextPriceUpdateDate
  //  - threshold - number in seconds - .
  threshold?: number
  // Displays the text that will be displayed when the threshold is reached.
  // - thresholdReachedLabel - could be a React components or simple string
  thresholdReachedLabel?: JSX.Element | string
}

export function VaultNextPriceUpdateCounter({
  nextPriceUpdateDate,
  threshold,
  thresholdReachedLabel = threshold?.toString(),
}: VaultNextPriceUpdateCounterProps) {
  const [{ key, duration }, setConfig] = useState({
    key: 0,
    duration: 0,
  })

  const { theme } = useThemeUI()

  useEffect(() => {
    const nextUpdateTimestamp = nextPriceUpdateDate?.getTime()
    const nextUpdateInSeconds = nextUpdateTimestamp ? nextUpdateTimestamp / 1000 : 0
    const now = moment().unix()
    const left = nextUpdateInSeconds - now

    setConfig({
      key: nextUpdateTimestamp,
      duration: left >= 0 ? left : 0,
    })
  }, [nextPriceUpdateDate])

  return (
    <CountdownCircleTimer
      key={key}
      size={56}
      strokeWidth={3}
      colors={[
        // @ts-ignore
        [theme.colors.counter.primary, 0],
        // @ts-ignore
        [theme.colors.counter.secondary, 0],
      ]}
      // @ts-ignore
      trailColor={theme.colors.counter.surface}
      duration={duration}
      isLinearGradient={true}
      isPlaying={!!duration}
    >
      {({ remainingTime }) => {
        const hasHitThreshold =
          threshold &&
          remainingTime !== undefined &&
          remainingTime !== null &&
          remainingTime < threshold

        // Since there is not exposed mechanism to force the countdown to display
        // finished state, it must be forced by setting the counter to 0. That
        // way it will display finished state.
        // Using a new key basically forces the counter to restart. When it restarts the duration
        // is set to 0 so it goes into finished state immediately.
        useEffect(() => {
          if (hasHitThreshold && remainingTime && remainingTime > 0) {
            setConfig(({ key }) => ({
              key: key - 1,
              duration: 0,
            }))
          }
        }, [remainingTime])

        return hasHitThreshold ? (
          thresholdReachedLabel
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Heading as="h3" sx={{ lineHeight: '1.0', color: 'banner.warning' }}>
              {remainingTime && Math.floor(remainingTime / 60)}
            </Heading>
            <Text sx={{ lineHeight: '1.0', fontSize: 1, color: 'mutedAlt' }}>mins</Text>
          </Box>
        )
      }}
    </CountdownCircleTimer>
  )
}

export function VaultBannersView({ id }: { id: BigNumber }) {
  const { vaultBanners$ } = useAppContext()
  const state = useObservable(vaultBanners$(id))
  if (!state) return null

  const { token, nextCollateralPrice, dateNextCollateralPrice, liquidationPrice } = state

  if (nextCollateralPrice?.lt(liquidationPrice)) {
    return (
      <VaultWarningBanner
        token={token}
        id={id.toString()}
        dateNextCollateralPrice={dateNextCollateralPrice}
      />
    )
  }

  return null
}