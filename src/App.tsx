import { useState, useEffect } from 'react';
import { Trash2, Plus, Search, Key, RefreshCw, ExternalLink, Loader2, ChevronRight } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

interface Account {
  id: number;
  name: string;
  fakeid: string;
}

interface Article {
  title: string;
  digest: string;
  link: string;
  create_time: number;
  cover: string;
}

export default function App() {
  // Use provided keys as defaults
  const [mptextKey, setMptextKey] = useLocalStorage('mptext_key', '');
  const [geminiKey, setGeminiKey] = useLocalStorage('gemini_key', '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [articles, setArticles] = useState<{ [key: string]: Article[] }>({});
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<{ [key: string]: string }>({});
  const [summarizing, setSummarizing] = useState<{ [key: string]: boolean }>({});
  
  // Daily Report State
  const [generatingReport, setGeneratingReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<string>('');
  const [reportKeywords, setReportKeywords] = useLocalStorage('report_keywords', '');
  const [filteredArticles, setFilteredArticles] = useState<any[]>([]);
  const [reportStatus, setReportStatus] = useState('');
  
  // Search State
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  // View State
  const [activeTab, setActiveTab] = useState<'accounts' | 'settings' | 'report'>('report');

  // Force update keys if they are empty (fixes issue where old empty keys persist in localStorage)
  useEffect(() => {
    // Keys removed for security. User must enter them in Settings.
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      setAccounts(data);
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    }
  };

  const searchAccount = async () => {
    if (!searchKeyword) {
      alert("Please enter a keyword to search.");
      return;
    }
    if (!mptextKey) {
      alert("API Key is missing. Please check Settings.");
      return;
    }

    setSearching(true);
    setSearchResults([]); // Clear previous results

    try {
      const res = await fetch('/api/proxy/mptext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://down.mptext.top/api/public/v1/account',
          headers: { 'X-Auth-Key': mptextKey },
          params: { keyword: searchKeyword, size: 5 }
        })
      });
      
      const data = await res.json();
      console.log("Search response:", data);

      // API returns 'list' for results, but we check 'data' too just in case
      const results = data.list || data.data;

      if (res.ok && results) {
        if (results.length === 0) {
          alert("No accounts found matching that keyword.");
        }
        setSearchResults(results);
      } else {
        alert(`Search failed: ${data.msg || data.error || data.base_resp?.err_msg || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Network error during search. Check console for details.');
    } finally {
      setSearching(false);
    }
  };

  const addAccount = async (account: any) => {
    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: account.nickname, fakeid: account.fakeid })
    });
    setSearchResults([]);
    setSearchKeyword('');
    fetchAccounts();
    setActiveTab('accounts');
  };

  const removeAccount = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    await fetch('/api/accounts/' + id, { method: 'DELETE' });
    fetchAccounts();
  };

  const generateDailyReport = async () => {
    if (!geminiKey || !mptextKey) {
      alert('Missing API Keys');
      return;
    }
    
    setGeneratingReport(true);
    setFilteredArticles([]);
    setReportStatus('Fetching articles...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayTs = Math.floor(yesterday.getTime() / 1000);
      const todayTs = yesterdayTs + 86400;

      let allArticles: any[] = [];

      // 1. Fetch all articles
      for (const acc of accounts) {
        setReportStatus(`Fetching from ${acc.name}...`);
        const res = await fetch('/api/proxy/mptext', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://down.mptext.top/api/public/v1/article',
            headers: { 'X-Auth-Key': mptextKey },
            params: { fakeid: acc.fakeid, size: 8 } 
          })
        });
        const data = await res.json();
        const list = data.articles || data.list || data.data;
        
        if (list) {
          const accountArticles = list.filter((a: Article) => 
            a.create_time >= yesterdayTs && a.create_time < todayTs
          ).map((a: Article) => ({
            ...a,
            accountName: acc.name,
            accountId: acc.id
          }));
          allArticles = [...allArticles, ...accountArticles];
        }
      }

      if (allArticles.length === 0) {
        setReportStatus('No articles found for yesterday.');
        setGeneratingReport(false);
        return;
      }

      // 2. Filter with Gemini
      setReportStatus(`Analyzing ${allArticles.length} articles with AI...`);
      
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const keywords = reportKeywords.trim();
      
      if (!keywords) {
        // If no keywords, just show all
        setFilteredArticles(allArticles);
        setReportStatus(`Found ${allArticles.length} articles.`);
      } else {
        // Prepare prompt
        const articlesList = allArticles.map((a, index) => 
          `ID: ${index}\nTitle: ${a.title}\nDigest: ${a.digest}\nAccount: ${a.accountName}\n`
        ).join('\n---\n');

        const prompt = `
          I have a list of WeChat articles published yesterday.
          My interests/keywords are: ${keywords}

          Please filter this list and return ONLY the articles that are relevant to my interests.
          
          Return the result as a JSON array of objects. Each object must have:
          - "id": The ID provided in the input (integer)
          - "reason": A brief 1-sentence explanation of why it matches my interests.

          If no articles match, return an empty array [].
          Do not include any markdown formatting (like \`\`\`json), just the raw JSON string.

          Articles:
          ${articlesList}
        `;

        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt
        });
        
        const responseText = result.text ? result.text.replace(/```json/g, '').replace(/```/g, '').trim() : "[]";
        
        try {
          const matches = JSON.parse(responseText);
          const finalArticles = matches.map((m: any) => {
            const original = allArticles[m.id];
            return { ...original, reason: m.reason };
          });
          setFilteredArticles(finalArticles);
          setReportStatus(`Found ${finalArticles.length} relevant articles.`);
        } catch (e) {
          console.error("Failed to parse Gemini response", e);
          setReportStatus('AI analysis failed. Showing all articles.');
          setFilteredArticles(allArticles);
        }
      }

    } catch (e) {
      console.error(e);
      setReportStatus("Error generating report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  // Flatten articles for feed, sort by time
  // const feedArticles = Object.entries(articles).flatMap(([fakeid, list]) => {
  //   const account = accounts.find(a => a.fakeid === fakeid);
  //   return list.map(item => ({ ...item, accountName: account?.name || 'Unknown', fakeid }));
  // }).sort((a, b) => b.create_time - a.create_time);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <span className="text-emerald-600">We</span>Scholarly
          </h1>
          <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'report' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Daily Report
            </button>
            <button 
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'accounts' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Accounts
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'settings' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* REPORT TAB */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Daily Briefing</h2>
                  <p className="text-sm text-gray-500">Generate a summary of yesterday's articles from all tracked accounts.</p>
                </div>
                <button 
                  onClick={generateDailyReport}
                  disabled={generatingReport || accounts.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-sm hover:shadow-md"
                >
                  {generatingReport ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <span className="text-lg">⚡️</span> Generate Report
                    </>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter Keywords (Optional)
                </label>
                <textarea 
                  value={reportKeywords}
                  onChange={(e) => setReportKeywords(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm h-20"
                  placeholder="e.g. deep learning, machine learning, metagenomics (Leave empty to summarize ALL articles)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only articles containing these keywords in the title or digest will be summarized. Separate with commas or newlines.
                </p>
              </div>
            </div>

            {filteredArticles.length > 0 ? (
              <div className="grid gap-4">
                {filteredArticles.map((article, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {article.accountName}
                          </span>
                          {article.reason && (
                            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="text-amber-500">★</span> {article.reason}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 leading-tight mb-2">
                          <a href={article.link} target="_blank" rel="noreferrer" className="hover:text-emerald-600 transition-colors">
                            {article.title}
                          </a>
                        </h3>
                        <p className="text-gray-500 text-sm line-clamp-2 mb-3">
                          {article.digest}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                           <span>{new Date(article.create_time * 1000).toLocaleString()}</span>
                           <a href={article.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-600">
                             Read Original <ExternalLink className="w-3 h-3" />
                           </a>
                        </div>
                      </div>
                      {article.cover && (
                        <img 
                          src={article.cover} 
                          alt="" 
                          className="w-20 h-20 object-cover rounded-lg bg-gray-100 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !generatingReport && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                  <p className="text-gray-500">{reportStatus || "Click the button above to generate yesterday's briefing."}</p>
                </div>
              )
            )}
            
            {generatingReport && (
               <div className="text-center py-12">
                 <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-4" />
                 <p className="text-gray-500">{reportStatus}</p>
               </div>
            )}
          </div>
        )}
        
        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-gray-400" /> API Configuration
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MPText API Key (X-Auth-Key)</label>
                  <input 
                    type="password" 
                    value={mptextKey}
                    onChange={(e) => setMptextKey(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Enter your MPText key"
                  />
                  <p className="text-xs text-gray-500 mt-1">Required to fetch articles.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gemini API Key</label>
                  <input 
                    type="password" 
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Enter your Gemini API key"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for AI summarization. 
                    {process.env.GEMINI_API_KEY && !geminiKey && <span className="text-emerald-600 ml-1"> (System key available)</span>}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Danger Zone
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Clear all local data, including API keys and cached accounts. This cannot be undone.
              </p>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to clear all data?')) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 font-medium transition-colors"
              >
                Reset Application
              </button>
            </div>
          </div>
        )}

        {/* ACCOUNTS TAB */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-gray-400" /> Add Account
              </h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchAccount()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Search Official Account Name (e.g. 阮一峰)"
                />
                <button 
                  onClick={searchAccount}
                  disabled={searching || !mptextKey}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-500 font-medium">Search Results:</p>
                  <ul className="divide-y divide-gray-100">
                    {searchResults.map((acc) => (
                      <li key={acc.fakeid} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {acc.round_head_img && <img src={acc.round_head_img} alt="" className="w-10 h-10 rounded-full bg-gray-100" referrerPolicy="no-referrer" />}
                          <div>
                            <p className="font-medium text-gray-900">{acc.nickname}</p>
                            <p className="text-xs text-gray-500">{acc.alias || acc.fakeid}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => addAccount(acc)}
                          className="text-emerald-600 hover:text-emerald-700 text-sm font-medium px-3 py-1 bg-emerald-50 rounded-full"
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4">Tracked Accounts ({accounts.length})</h2>
              {accounts.length === 0 ? (
                <p className="text-gray-500 text-sm">No accounts added yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {accounts.map((acc) => (
                    <li key={acc.id} className="py-3 flex items-center justify-between group">
                      <span className="font-medium text-gray-700">{acc.name}</span>
                      <button 
                        onClick={() => removeAccount(acc.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* FEED TAB REMOVED */}
      </main>
    </div>
  );
}
