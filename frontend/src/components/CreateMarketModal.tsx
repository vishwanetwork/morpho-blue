import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketParams } from '../types';

interface CreateMarketDefaults {
  loanToken?: string;
  collateralToken?: string;
  oracle?: string;
  irm?: string;
  lltv?: string;
}

interface CreateMarketModalProps {
  onClose: () => void;
  onCreate: (params: MarketParams, onStatus?: (status: string) => void) => Promise<void>;
  defaults?: CreateMarketDefaults;
  irmHint?: string;
}

export function CreateMarketModal({ onClose, onCreate, defaults, irmHint }: CreateMarketModalProps) {
  const { t } = useTranslation();
  const [loanToken, setLoanToken] = useState(defaults?.loanToken || '');
  const [collateralToken, setCollateralToken] = useState(defaults?.collateralToken || '');
  const [oracle, setOracle] = useState(defaults?.oracle || '');
  const [irm, setIrm] = useState(defaults?.irm || '0x0000000000000000000000000000000000000000');
  const [lltv, setLltv] = useState(defaults?.lltv || '0.8');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!defaults) return;
    if (defaults.loanToken) setLoanToken(defaults.loanToken);
    if (defaults.collateralToken) setCollateralToken(defaults.collateralToken);
    if (defaults.oracle) setOracle(defaults.oracle);
    if (defaults.irm) setIrm(defaults.irm);
    if (defaults.lltv) setLltv(defaults.lltv);
  }, [defaults]);

  const handleCreate = async () => {
    if (!loanToken || !collateralToken || !oracle) {
      setError(t('createMarket.fillAllFields'));
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const lltvWad = BigInt(Math.floor(parseFloat(lltv) * 1e18));
      setStatus(t('createMarket.checkingLltv'));
      await onCreate({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv: lltvWad,
      }, setStatus);
      onClose();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('errors.createFailed');
      if (errorMsg.includes('LLTV') && errorMsg.includes('启用')) {
        setStatus(null);
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-600">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{t('createMarket.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('createMarket.loanTokenAddress')}</label>
            <input
              type="text"
              value={loanToken}
              onChange={(e) => setLoanToken(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('createMarket.collateralTokenAddress')}</label>
            <input
              type="text"
              value={collateralToken}
              onChange={(e) => setCollateralToken(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('createMarket.oracleAddress')}</label>
            <input
              type="text"
              value={oracle}
              onChange={(e) => setOracle(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('createMarket.irmAddress')}</label>
            <input
              type="text"
              value={irm}
              onChange={(e) => setIrm(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
            {irmHint && (
              <div className="text-xs text-gray-500 mt-1">
                {t('createMarket.recommendedIrm', { irm: irmHint })}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('createMarket.lltvLabel')}</label>
            <input
              type="text"
              value={lltv}
              onChange={(e) => setLltv(e.target.value)}
              placeholder="0.8"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {status && (
          <div className="mt-4 p-3 bg-blue-900/50 border border-blue-500 rounded-lg text-blue-300 text-sm">
            {status}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full mt-4 bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? (status || t('createMarket.creating')) : t('createMarket.title')}
        </button>
      </div>
    </div>
  );
}
