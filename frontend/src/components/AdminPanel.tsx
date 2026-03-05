import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketInfo } from '../types';
import { parseUnits, Contract, JsonRpcSigner } from 'ethers';
import { ChainConfig } from '../contracts/config';
import { ORACLE_ABI } from '../contracts/abis';
import { CustomSelect } from './CustomSelect';

interface AdminPanelProps {
  markets: MarketInfo[];
  address: string | null;
  signer: JsonRpcSigner | null;
  chainConfig: ChainConfig | null;
  supportsTiered: boolean;
  supportsWhitelist: boolean;
  onAddLiquidator: (marketId: string, liquidator: string) => Promise<void>;
  onRemoveLiquidator: (marketId: string, liquidator: string) => Promise<void>;
  onSetWhitelistMode: (marketId: string, enabled: boolean) => Promise<void>;
  onConfigureMarket: (marketId: string, config: {
    enabled: boolean;
    maxLiquidationRatio: bigint;
    cooldownPeriod: bigint;
    minSeizedAssets: bigint;
    publicLiquidationEnabled: boolean;
    twoStepLiquidationEnabled: boolean;
    whitelistOneStepEnabled: boolean;
    lockDuration: bigint;
    requestDeposit: bigint;
    protocolFee: bigint;
  }) => Promise<void>;
}

export function AdminPanel({
  markets,
  address,
  signer,
  chainConfig,
  supportsTiered,
  supportsWhitelist,
  onAddLiquidator,
  onRemoveLiquidator,
  onSetWhitelistMode: _onSetWhitelistMode,
  onConfigureMarket,
}: AdminPanelProps) {
  const { t } = useTranslation();
  const [selectedMarket, setSelectedMarket] = useState<MarketInfo | null>(null);
  const [liquidatorAddress, setLiquidatorAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [oraclePrice, setOraclePrice] = useState('2000');

  const [config, setConfig] = useState({
    enabled: true,
    publicLiquidation: true,
    twoStepLiquidation: false,
    whitelistOneStep: true,
    maxLiquidationRatio: '1',
    cooldownPeriod: '3600',
    minSeizedAssets: '0',
    lockDuration: '300',
    requestDeposit: '0.01',
    protocolFee: '0.01',
  });

  const handleAddLiquidator = async () => {
    if (!selectedMarket || !liquidatorAddress) {
      setError(t('admin.selectMarketAndAddress'));
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(liquidatorAddress)) {
      setError(t('admin.invalidAddress'));
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onAddLiquidator(selectedMarket.id, liquidatorAddress);
      setLiquidatorAddress('');
      setSuccess(t('admin.addSuccess', { address: liquidatorAddress.slice(0, 10) }));
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      if (errorStr.includes('CALL_EXCEPTION')) {
        setError(t('admin.addFailAdmin'));
      } else if (errorStr.includes('user rejected')) {
        setError(t('admin.txCancelled'));
      } else {
        setError(`${errorStr.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLiquidator = async () => {
    if (!selectedMarket || !liquidatorAddress) {
      setError(t('admin.selectMarketAndAddress'));
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(liquidatorAddress)) {
      setError(t('admin.invalidAddress'));
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onRemoveLiquidator(selectedMarket.id, liquidatorAddress);
      setLiquidatorAddress('');
      setSuccess(t('admin.removeSuccess', { address: liquidatorAddress.slice(0, 10) }));
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      if (errorStr.includes('CALL_EXCEPTION')) {
        setError(t('admin.removeFailAdmin'));
      } else if (errorStr.includes('user rejected')) {
        setError(t('admin.txCancelled'));
      } else {
        setError(`${errorStr.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureMarket = async () => {
    if (!selectedMarket) return;

    const ratio = parseFloat(config.maxLiquidationRatio);
    if (isNaN(ratio) || ratio <= 0 || ratio > 1) {
      setError(t('admin.ratioError'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onConfigureMarket(selectedMarket.id, {
        enabled: config.enabled,
        maxLiquidationRatio: parseUnits(config.maxLiquidationRatio, 18),
        cooldownPeriod: BigInt(config.cooldownPeriod),
        minSeizedAssets: parseUnits(config.minSeizedAssets, 18),
        publicLiquidationEnabled: config.publicLiquidation,
        twoStepLiquidationEnabled: config.twoStepLiquidation,
        whitelistOneStepEnabled: config.whitelistOneStep,
        lockDuration: BigInt(config.lockDuration),
        requestDeposit: parseUnits(config.requestDeposit, 18),
        protocolFee: parseUnits(config.protocolFee, 18),
      });
      setSuccess(t('admin.configSaved'));
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      if (errorStr.includes('CALL_EXCEPTION')) {
        setError(t('admin.configFailCheck'));
      } else {
        setError(`${errorStr.substring(0, 100)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetOraclePrice = async () => {
    if (!selectedMarket || !signer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const oracleAddress = selectedMarket.params.oracle;
      const oracle = new Contract(oracleAddress, ORACLE_ABI, signer);

      const loanDecimals = selectedMarket.loanTokenDecimals || 18;
      const collateralDecimals = selectedMarket.collateralTokenDecimals || 18;
      const scaleFactor = 36 + loanDecimals - collateralDecimals;

      const priceValue = parseFloat(oraclePrice);
      const scaledPrice = BigInt(Math.floor(priceValue * 1e6)) * BigInt(10) ** BigInt(scaleFactor - 6);

      const tx = await oracle.setPrice(scaledPrice);
      await tx.wait();
      setSuccess(t('admin.priceSet', {
        price: oraclePrice,
        loan: selectedMarket.loanTokenSymbol,
        collateral: selectedMarket.collateralTokenSymbol
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.setPriceFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">
        {t('admin.title')}
        {chainConfig && (
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({chainConfig.shortName})
          </span>
        )}
      </h2>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('admin.selectMarket')}</label>
        <CustomSelect
          value={selectedMarket?.id || ''}
          onChange={(value) => setSelectedMarket(markets.find((m) => m.id === value) || null)}
          options={[
            { value: '', label: t('admin.selectMarket') },
            ...markets.map((m) => ({
              value: m.id,
              label: `${m.loanTokenSymbol} / ${m.collateralTokenSymbol}`
            }))
          ]}
          placeholder={t('admin.selectMarket')}
        />
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-${supportsTiered ? '3' : '2'} gap-6`}>
        {/* Oracle Price Settings */}
        <div className="glass rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">📊 {t('admin.oraclePriceSettings')}</h3>
          <div className="space-y-3">
            <div className="text-sm text-gray-400 mb-2">
              {selectedMarket ? (
                <>
                  <div>{t('admin.oracleLabel', { address: selectedMarket.params.oracle.slice(0, 10) })}</div>
                  <div>{t('admin.setPriceDesc', { collateral: selectedMarket.collateralTokenSymbol, loan: selectedMarket.loanTokenSymbol })}</div>
                </>
              ) : (
                t('admin.selectMarketFirst')
              )}
            </div>
            <input
              type="number"
              value={oraclePrice}
              onChange={(e) => setOraclePrice(e.target.value)}
              placeholder={t('admin.pricePlaceholder')}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
            <button
              onClick={handleSetOraclePrice}
              disabled={loading || !address || !selectedMarket || !signer}
              className="w-full bg-blue-500 hover:bg-blue-600 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? t('admin.setting') : t('admin.setPrice')}
            </button>
          </div>
        </div>

        {/* Whitelist Management */}
        {supportsWhitelist && (
          <div className="glass rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">👥 {t('admin.whitelistManagement')}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={liquidatorAddress}
                onChange={(e) => setLiquidatorAddress(e.target.value)}
                placeholder={t('admin.liquidatorAddress')}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleAddLiquidator}
                  disabled={loading || !address || !selectedMarket}
                  className="bg-green-500 hover:bg-green-600 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {t('common.add')}
                </button>
                <button
                  onClick={handleRemoveLiquidator}
                  disabled={loading || !address || !selectedMarket}
                  className="bg-red-500 hover:bg-red-600 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {t('common.remove')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Liquidation Configuration */}
        {supportsTiered && (
          <div className="glass rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">⚙️ {t('admin.liquidationConfig')}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{t('admin.enableLiquidation')}</span>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{t('admin.publicLiquidation')}</span>
                <input
                  type="checkbox"
                  checked={config.publicLiquidation}
                  onChange={(e) => setConfig({ ...config, publicLiquidation: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{t('admin.twoStepLiquidation')}</span>
                <input
                  type="checkbox"
                  checked={config.twoStepLiquidation}
                  onChange={(e) => setConfig({ ...config, twoStepLiquidation: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{t('admin.whitelistOneStep')}</span>
                <input
                  type="checkbox"
                  checked={config.whitelistOneStep}
                  onChange={(e) => setConfig({ ...config, whitelistOneStep: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t('admin.maxLiquidationRatio')} <span className="text-gray-500">{t('admin.maxLiquidationRatioHint')}</span>
                </label>
                <input
                  type="text"
                  value={config.maxLiquidationRatio}
                  onChange={(e) => setConfig({ ...config, maxLiquidationRatio: e.target.value })}
                  placeholder="1"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('admin.protocolFee')}</label>
                <input
                  type="text"
                  value={config.protocolFee}
                  onChange={(e) => setConfig({ ...config, protocolFee: e.target.value })}
                  placeholder="0.01"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
                />
              </div>

              <button
                onClick={handleConfigureMarket}
                disabled={loading || !address || !selectedMarket}
                className="w-full bg-purple-500 hover:bg-purple-600 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {loading ? t('admin.saving') : t('admin.saveConfig')}
              </button>
            </div>
          </div>
        )}

        {/* Chain Info */}
        {!supportsTiered && !supportsWhitelist && (
          <div className="glass rounded-xl p-6 border border-blue-700/50">
            <h3 className="text-lg font-bold mb-4 text-blue-400">ℹ️ {t('admin.chainInfo')}</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>{t('admin.chainInfoDesc', { chain: chainConfig?.shortName || '' })}</p>
              <ul className="list-disc list-inside text-gray-400 space-y-1">
                <li>{t('admin.chainInfoPoint1')}</li>
                <li>{t('admin.chainInfoPoint2')}</li>
                <li>{t('admin.chainInfoPoint3')}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-900/50 border border-green-500 rounded-lg text-green-300 text-sm">
          {success}
        </div>
      )}
    </div>
  );
}
