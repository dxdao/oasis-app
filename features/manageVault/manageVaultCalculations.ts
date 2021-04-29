import { BigNumber } from 'bignumber.js'
import { IlkData } from 'blockchain/ilks'
import { Vault } from 'blockchain/vaults'
import { BalanceInfo } from 'features/shared/balanceInfo'
import { zero } from 'helpers/zero'

import { ManageVaultState } from './manageVault'

// This value ought to be coupled in relation to how much we round the raw debt
// value in the vault (vault.debt)
export const PAYBACK_ALL_BOUND = new BigNumber('0.01')

export interface ManageVaultCalculations {
  maxDepositAmount: BigNumber
  maxDepositAmountUSD: BigNumber
  maxWithdrawAmountAtCurrentPrice: BigNumber
  maxWithdrawAmountAtNextPrice: BigNumber
  maxWithdrawAmount: BigNumber
  maxWithdrawAmountUSD: BigNumber
  maxGenerateAmount: BigNumber
  maxGenerateAmountAtCurrentPrice: BigNumber
  maxGenerateAmountAtNextPrice: BigNumber
  maxPaybackAmount: BigNumber
  daiYieldFromTotalCollateral: BigNumber
  daiYieldFromTotalCollateralAtNextPrice: BigNumber
  afterDebt: BigNumber
  afterLiquidationPrice: BigNumber
  afterCollateralizationRatio: BigNumber
  afterCollateralizationRatioAtNextPrice: BigNumber
  afterFreeCollateral: BigNumber
  afterFreeCollateralAtNextPrice: BigNumber
  afterBackingCollateral: BigNumber
  afterBackingCollateralAtNextPrice: BigNumber
  afterLockedCollateral: BigNumber
  shouldPaybackAll: boolean
}

export const defaultManageVaultCalculations: ManageVaultCalculations = {
  maxDepositAmount: zero,
  maxDepositAmountUSD: zero,
  maxWithdrawAmountAtCurrentPrice: zero,
  maxWithdrawAmountAtNextPrice: zero,
  maxWithdrawAmount: zero,
  maxWithdrawAmountUSD: zero,
  maxGenerateAmount: zero,
  maxGenerateAmountAtCurrentPrice: zero,
  maxGenerateAmountAtNextPrice: zero,
  maxPaybackAmount: zero,
  afterDebt: zero,
  afterCollateralizationRatio: zero,
  afterCollateralizationRatioAtNextPrice: zero,
  afterLiquidationPrice: zero,
  afterFreeCollateral: zero,
  afterFreeCollateralAtNextPrice: zero,
  afterBackingCollateral: zero,
  afterBackingCollateralAtNextPrice: zero,
  afterLockedCollateral: zero,
  daiYieldFromTotalCollateral: zero,
  daiYieldFromTotalCollateralAtNextPrice: zero,
  shouldPaybackAll: false,
}

/*
 * Determines if on the basis of the user input the users intention to pay back
 * all of their debt.
 */
function determineShouldPaybackAll({
  paybackAmount,
  debt,
  debtOffset,
  daiBalance,
}: Pick<ManageVaultState, 'paybackAmount'> &
  Pick<Vault, 'debt' | 'debtOffset'> &
  Pick<BalanceInfo, 'daiBalance'>): boolean {
  return (
    debt.isPositive() &&
    daiBalance.gte(debt.plus(debtOffset)) &&
    !!(paybackAmount && paybackAmount.plus(PAYBACK_ALL_BOUND).gte(debt) && !paybackAmount.gt(debt))
  )
}

/*
 * Should return the expected lockedCollateral on the basis of the amount
 * of collateral that is being deposited or withdrawn. Must return a
 * non-negative value
 */
function calculateAfterLockedCollateral({
  lockedCollateral,
  depositAmount,
  withdrawAmount,
}: Pick<ManageVaultState, 'depositAmount' | 'withdrawAmount'> & Pick<Vault, 'lockedCollateral'>) {
  const amount = depositAmount
    ? lockedCollateral.plus(depositAmount)
    : withdrawAmount
    ? lockedCollateral.minus(withdrawAmount)
    : lockedCollateral

  return amount.gte(zero) ? amount : zero
}

/*
 * Should return the expected debt in the vault on the basis of the amount of
 * dai the user is generating or paying back. Must return a non-negative value
 *
 * If the shouldPaybackAll flag is true than we assume that the debt after
 * the transaction will be 0
 */
function calculateAfterDebt({
  shouldPaybackAll,
  generateAmount,
  paybackAmount,
  debt,
}: Pick<ManageVaultState, 'shouldPaybackAll' | 'generateAmount' | 'paybackAmount'> &
  Pick<Vault, 'debt'>) {
  if (shouldPaybackAll) return zero

  const amount = generateAmount
    ? debt.plus(generateAmount)
    : paybackAmount
    ? debt.minus(paybackAmount)
    : debt

  return amount.gte(zero) ? amount : zero
}

/*
 * Should return the minimum amount of collateral necessary to back the
 * expected debt in the vault on the basis of the amount of dai the user is
 * generating or paying back
 *
 */
function calculateAfterBackingCollateral({
  afterDebt,
  liquidationRatio,
  price,
}: Pick<ManageVaultState, 'afterDebt'> & Pick<IlkData, 'liquidationRatio'> & { price: BigNumber }) {
  if (!afterDebt.isPositive()) return zero

  return afterDebt.times(liquidationRatio).div(price)
}

/*
 * Should return the maximum amount of collateral that can be possibly
 * withdrawn given the amount of collateral being deposited or withdrawn and
 * the amount of dai being generated or payed back. It should return a
 * non-negative value
 */
function calculateAfterFreeCollateral({
  lockedCollateral,
  backingCollateral,
}: {
  lockedCollateral: BigNumber
  backingCollateral: BigNumber
}) {
  const amount = lockedCollateral.minus(backingCollateral)
  return amount.gte(zero) ? amount : zero
}

/*
 * Should return the maximum amount of collateral that can be withdrawn given
 * the current amount of locked collateral in the vault and factoring in the
 * amount of collateral that would be freed if the user was paying back
 *
 * We must also account for the potential accrual in vault debt which decreases
 * the amount of collateral that can be withdrawn, should we not be paying back
 * all debt at the same time. We do this by increasing the expected debt amount
 * with a small offset amount.
 *
 */
function calculateMaxWithdrawAmount({
  paybackAmount,
  shouldPaybackAll,
  lockedCollateral,
  debt,
  debtOffset,
  liquidationRatio,
  price,
}: Pick<ManageVaultState, 'paybackAmount' | 'shouldPaybackAll'> &
  Pick<Vault, 'lockedCollateral' | 'debt' | 'debtOffset'> &
  Pick<IlkData, 'liquidationRatio'> & { price: BigNumber }) {
  const afterDebt = calculateAfterDebt({ shouldPaybackAll, debt, paybackAmount })
  const afterDebtWithOffset = afterDebt.isPositive() ? afterDebt.plus(debtOffset) : afterDebt

  const backingCollateral = calculateAfterBackingCollateral({
    afterDebt: afterDebtWithOffset,
    liquidationRatio,
    price,
  })

  return calculateAfterFreeCollateral({
    lockedCollateral,
    backingCollateral,
  })
}

/*
 * Should return the amount of dai that can be generated given the amount of
 * potential collateral and debt in the vault
 */
function calculateDaiYieldFromCollateral({
  debt,
  liquidationRatio,
  generateAmount,
  paybackAmount,
  price,
  collateral,
  ilkDebtAvailable,
}: Pick<ManageVaultState, 'generateAmount' | 'paybackAmount'> &
  Pick<Vault, 'debt'> &
  Pick<IlkData, 'liquidationRatio' | 'ilkDebtAvailable'> & {
    price: BigNumber
    collateral: BigNumber
  }) {
  const daiYield = collateral.times(price).div(liquidationRatio).minus(debt)

  if (!daiYield.isPositive()) return zero

  if (daiYield.gt(ilkDebtAvailable)) {
    if (ilkDebtAvailable.isPositive()) {
      const amount = ilkDebtAvailable.plus(paybackAmount || zero).minus(generateAmount || zero)
      return amount.gte(zero) ? amount : zero
    }
    return zero
  }

  return daiYield
}

/*
 * Should return the maximum amount of dai that can be generated in context
 * of what collateral currently exists and is being deposited aswell as the
 * debt already existng in the vault.
 *
 * It should also not exceed the debt ceiling for that ilk and also account
 * for the accrued interest should the vault debt be non-zero
 */
function calculateMaxGenerateAmount({
  depositAmount,
  generateAmount,
  debt,
  debtOffset,
  lockedCollateral,
  liquidationRatio,
  price,
  ilkDebtAvailable,
}: Pick<ManageVaultState, 'depositAmount' | 'generateAmount'> &
  Pick<Vault, 'debtOffset' | 'debt' | 'lockedCollateral'> &
  Pick<IlkData, 'liquidationRatio' | 'ilkDebtAvailable'> & {
    price: BigNumber
  }) {
  const afterLockedCollateral = calculateAfterLockedCollateral({
    lockedCollateral,
    depositAmount,
  })

  return calculateDaiYieldFromCollateral({
    ilkDebtAvailable,
    collateral: afterLockedCollateral,
    price,
    liquidationRatio,
    debt: debt.plus(debtOffset),
    generateAmount,
  })
}

export function applyManageVaultCalculations(state: ManageVaultState): ManageVaultState {
  const {
    depositAmount,
    generateAmount,
    withdrawAmount,
    paybackAmount,
    balanceInfo: { collateralBalance, daiBalance },
    ilkData: { liquidationRatio, ilkDebtAvailable },
    priceInfo: { currentCollateralPrice, nextCollateralPrice },
    vault: { lockedCollateral, debt, debtOffset },
  } = state

  const shouldPaybackAll = determineShouldPaybackAll({
    paybackAmount,
    debt,
    daiBalance,
    debtOffset,
  })
  const afterLockedCollateral = calculateAfterLockedCollateral({
    lockedCollateral,
    depositAmount,
    withdrawAmount,
  })
  const afterLockedCollateralUSD = afterLockedCollateral.times(currentCollateralPrice)
  const afterLockedCollateralUSDAtNextPrice = afterLockedCollateral.times(nextCollateralPrice)
  const afterDebt = calculateAfterDebt({ shouldPaybackAll, debt, generateAmount, paybackAmount })

  const afterBackingCollateral = calculateAfterBackingCollateral({
    afterDebt,
    liquidationRatio,
    price: currentCollateralPrice,
  })

  const afterBackingCollateralAtNextPrice = calculateAfterBackingCollateral({
    afterDebt,
    liquidationRatio,
    price: nextCollateralPrice,
  })

  const afterFreeCollateral = calculateAfterFreeCollateral({
    lockedCollateral: afterLockedCollateral,
    backingCollateral: afterBackingCollateral,
  })

  const afterFreeCollateralAtNextPrice = calculateAfterFreeCollateral({
    lockedCollateral: afterLockedCollateral,
    backingCollateral: afterBackingCollateralAtNextPrice,
  })

  const maxWithdrawAmountAtCurrentPrice = calculateMaxWithdrawAmount({
    paybackAmount,
    shouldPaybackAll,
    lockedCollateral,
    debt,
    debtOffset,
    liquidationRatio,
    price: currentCollateralPrice,
  })

  const maxWithdrawAmountAtNextPrice = calculateMaxWithdrawAmount({
    paybackAmount,
    shouldPaybackAll,
    lockedCollateral,
    debt,
    debtOffset,
    liquidationRatio,
    price: nextCollateralPrice,
  })

  const maxWithdrawAmount = BigNumber.minimum(
    maxWithdrawAmountAtCurrentPrice,
    maxWithdrawAmountAtNextPrice,
  )
  const maxWithdrawAmountUSD = maxWithdrawAmount.times(currentCollateralPrice)

  const maxDepositAmount = collateralBalance
  const maxDepositAmountUSD = collateralBalance.times(currentCollateralPrice)

  const daiYieldFromTotalCollateral = calculateDaiYieldFromCollateral({
    ilkDebtAvailable,
    collateral: afterLockedCollateral,
    price: currentCollateralPrice,
    liquidationRatio,
    debt: afterDebt,
    generateAmount,
    paybackAmount,
  })

  const daiYieldFromTotalCollateralAtNextPrice = calculateDaiYieldFromCollateral({
    ilkDebtAvailable,
    collateral: afterLockedCollateral,
    price: nextCollateralPrice,
    liquidationRatio,
    debt: afterDebt,
    generateAmount,
    paybackAmount,
  })

  const maxGenerateAmountAtCurrentPrice = calculateMaxGenerateAmount({
    depositAmount,
    debt,
    debtOffset,
    ilkDebtAvailable,
    liquidationRatio,
    lockedCollateral,
    price: currentCollateralPrice,
  })

  const maxGenerateAmountAtNextPrice = calculateMaxGenerateAmount({
    depositAmount,
    debt,
    debtOffset,
    ilkDebtAvailable,
    liquidationRatio,
    lockedCollateral,
    price: nextCollateralPrice,
  })

  const maxGenerateAmount = BigNumber.minimum(
    maxGenerateAmountAtCurrentPrice,
    maxGenerateAmountAtNextPrice,
  )

  const maxPaybackAmount = daiBalance.lt(debt) ? daiBalance : debt

  const afterCollateralizationRatio =
    afterLockedCollateralUSD.isPositive() && afterDebt.isPositive()
      ? afterLockedCollateralUSD.div(afterDebt)
      : zero

  const afterCollateralizationRatioAtNextPrice =
    afterLockedCollateralUSDAtNextPrice.isPositive() && afterDebt.isPositive()
      ? afterLockedCollateralUSDAtNextPrice.div(afterDebt)
      : zero

  const afterLiquidationPrice =
    afterDebt.isPositive() && afterLockedCollateral.isPositive()
      ? afterDebt.times(liquidationRatio).div(afterLockedCollateral)
      : zero

  return {
    ...state,
    maxDepositAmount,
    maxDepositAmountUSD,
    maxWithdrawAmountAtCurrentPrice,
    maxWithdrawAmountAtNextPrice,
    maxWithdrawAmount,
    maxWithdrawAmountUSD,
    maxGenerateAmount,
    maxGenerateAmountAtCurrentPrice,
    maxGenerateAmountAtNextPrice,
    afterCollateralizationRatio,
    afterCollateralizationRatioAtNextPrice,
    afterLiquidationPrice,
    afterFreeCollateral,
    afterFreeCollateralAtNextPrice,
    afterLockedCollateral,
    afterBackingCollateral,
    afterBackingCollateralAtNextPrice,
    afterDebt,
    maxPaybackAmount,
    daiYieldFromTotalCollateral,
    daiYieldFromTotalCollateralAtNextPrice,
    shouldPaybackAll,
  }
}
