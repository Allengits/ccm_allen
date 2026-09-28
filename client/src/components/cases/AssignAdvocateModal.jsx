import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { unwrap } from '../../api/unwrap';
import { X, UserCheck, Search, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function AssignAdvocateModal({
  isOpen,
  onClose,
  onSuccess,
  caseId,
  caseNumber,
  existingAdvocates = [],
}) {
  const [advocates, setAdvocates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAdvocateId, setSelectedAdvocateId] = useState('');
  const [side, setSide] = useState('PETITIONER');

  const [loading, setLoading] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);
  const [error, setError] = useState(null);

  // Active advocate IDs already on this case
  const activeAdvocateMap = new Map();
  existingAdvocates.forEach((a) => {
    if (a.isActive) {
      activeAdvocateMap.set(a.advocateId, a.side);
    }
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedAdvocateId('');
      setSide('PETITIONER');
      setError(null);
      setSearchQuery('');
      fetchAdvocates();
    }
  }, [isOpen]);

  const fetchAdvocates = async () => {
    setFetchingList(true);
    try {
      const res = await api.get('/advocates?pageSize=50');
      const payload = unwrap(res);
      setAdvocates(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setError('Failed to fetch available advocates');
    } finally {
      setFetchingList(false);
    }
  };

  if (!isOpen) return null;

  const filteredAdvocates = advocates.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.barNumber.toLowerCase().includes(q) ||
      a.specialization.toLowerCase().includes(q)
    );
  });

  const selectedAdvocate = advocates.find((a) => a.id === selectedAdvocateId);
  const selectedAlreadyOnCaseSide = selectedAdvocateId
    ? activeAdvocateMap.get(selectedAdvocateId)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdvocateId) {
      setError('Please select an advocate to assign');
      return;
    }

    if (selectedAlreadyOnCaseSide) {
      setError(`This advocate is already actively assigned as ${selectedAlreadyOnCaseSide}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post(`/cases/${caseId}/advocates`, {
        advocateId: selectedAdvocateId,
        side,
      });

      const dataPayload = unwrap(res);

      onSuccess({
        assignment: dataPayload.assignment,
        warning: dataPayload.warning,
        statusChanged: dataPayload.statusChanged,
        currentStatus: dataPayload.currentStatus,
        message: res?.message || 'Advocate assigned successfully',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to assign advocate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-navy-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brass-500/20 border border-brass-400/40 flex items-center justify-center text-brass-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold">Assign Legal Counsel</h3>
              <p className="text-xs text-navy-300">
                Docket <span className="font-mono text-brass-300 font-semibold">{caseNumber}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-navy-300 hover:text-white transition-colors p-1 rounded hover:bg-navy-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start space-x-2 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Representation Side Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Representation Side <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-lg border cursor-pointer flex items-center space-x-3 transition-colors ${
                  side === 'PETITIONER'
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="side"
                  value="PETITIONER"
                  checked={side === 'PETITIONER'}
                  onChange={() => setSide('PETITIONER')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-bold text-navy-950">Petitioner</span>
                  <span className="text-[11px] text-gray-500">Complainant / Plaintiff Counsel</span>
                </div>
              </label>

              <label
                className={`p-3 rounded-lg border cursor-pointer flex items-center space-x-3 transition-colors ${
                  side === 'RESPONDENT'
                    ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="side"
                  value="RESPONDENT"
                  checked={side === 'RESPONDENT'}
                  onChange={() => setSide('RESPONDENT')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="block text-xs font-bold text-navy-950">Respondent</span>
                  <span className="text-[11px] text-gray-500">Accused / Defense Counsel</span>
                </div>
              </label>
            </div>
          </div>

          {/* Advocate Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Select Advocate From Directory <span className="text-red-500">*</span>
            </label>

            {/* Advocate Search Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search advocate by name, bar roll, specialization..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>

            {/* Scrollable Advocate List */}
            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
              {fetchingList ? (
                <div className="p-6 text-center text-gray-400 text-xs">
                  Loading active advocates...
                </div>
              ) : filteredAdvocates.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-xs">
                  No advocates matching "{searchQuery}"
                </div>
              ) : (
                filteredAdvocates.map((adv) => {
                  const alreadyAssignedSide = activeAdvocateMap.get(adv.id);
                  const isSelected = selectedAdvocateId === adv.id;

                  return (
                    <div
                      key={adv.id}
                      onClick={() => {
                        if (!alreadyAssignedSide) {
                          setSelectedAdvocateId(adv.id);
                        }
                      }}
                      className={`p-2.5 flex items-center justify-between text-xs transition-colors ${
                        alreadyAssignedSide
                          ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'bg-navy-50/80 border-l-4 border-navy-800 cursor-pointer'
                            : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-navy-950 truncate">{adv.name}</span>
                          <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {adv.barNumber}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{adv.specialization}</p>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {/* Workload badge */}
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                            adv.activeCaseCount >= 15
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {adv.activeCaseCount} active
                        </span>

                        {alreadyAssignedSide ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                            On {alreadyAssignedSide}
                          </span>
                        ) : isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-navy-800" />
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Workload Warning Preview if selected has high workload */}
          {selectedAdvocate && selectedAdvocate.activeCaseCount >= 15 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Caseload Advisory:</span> Advocate{' '}
                {selectedAdvocate.name} currently holds {selectedAdvocate.activeCaseCount} active
                cases (threshold: 15). Assignment is permitted, but registry staff should verify
                hearing availability.
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-3">
            {(!selectedAdvocateId || !!selectedAlreadyOnCaseSide) && (
              <span className="text-[11px] text-gray-500 mr-auto">
                {!selectedAdvocateId
                  ? 'Select an advocate from the list to assign counsel'
                  : `Advocate is already actively assigned on ${selectedAlreadyOnCaseSide}`}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedAdvocateId || !!selectedAlreadyOnCaseSide}
              title={
                !selectedAdvocateId
                  ? 'Select an advocate from the directory above'
                  : selectedAlreadyOnCaseSide
                    ? `Advocate is already assigned on ${selectedAlreadyOnCaseSide}`
                    : 'Confirm advocate assignment'
              }
              className="px-5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
            >
              {loading ? (
                <span>Assigning...</span>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Confirm Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
