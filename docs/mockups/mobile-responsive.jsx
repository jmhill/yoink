import React, { useState } from 'react';

const YoinkMobileWireframe = () => {
  const [activeTab, setActiveTab] = useState('inbox');
  const [inboxFilter, setInboxFilter] = useState('inbox');
  const [taskFilter, setTaskFilter] = useState('today');
  const [browseView, setBrowseView] = useState('root'); // 'root' | 'desktop' | 'folder'
  const [selectedFolder, setSelectedFolder] = useState(null);

  // Sample data
  const inboxItems = [
    { id: 1, content: 'Shared from x.com', url: 'https://x.com/status/123...', time: '22h ago', type: 'link' },
    { id: 2, content: 'Joel Eriksson on X: "CLI is always the base, then API over HTTP..."', url: 'https://x.com/OwariDa/...', time: '21h ago', type: 'link' },
    { id: 3, content: 'Laundry', time: '2h ago', type: 'text' },
    { id: 4, content: 'Soap', time: '3h ago', type: 'text' },
    { id: 5, content: 'Bug: swipe to snooze delay', time: '3h ago', type: 'text' },
  ];

  const tasks = [
    { id: 1, text: 'Review PR #234', container: 'Desktop', due: 'today' },
    { id: 2, text: 'Update API docs', container: 'Desktop', due: 'today' },
    { id: 3, text: 'Call plumber', container: 'Desktop', due: 'today' },
    { id: 4, text: 'Team sync prep', container: 'Projects', due: 'tomorrow' },
    { id: 5, text: 'Q1 planning doc', container: 'Projects', due: 'this week' },
    { id: 6, text: 'Research auth patterns', container: 'Reference', due: 'someday' },
  ];

  const folders = ['Projects', 'Reference', 'Someday', 'Archive'];

  // Icons as simple SVG components
  const Icons = {
    Inbox: () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    Tasks: () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    Browse: () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    Clock: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    Pin: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    ),
    Trash: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    Link: () => (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    ChevronRight: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
      </svg>
    ),
    ChevronLeft: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
      </svg>
    ),
    Desktop: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    Send: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  };

  // Inbox View
  const InboxView = () => (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex bg-slate-800/50 rounded-lg p-1 mx-4 mt-4">
        {['snoozed', 'inbox', 'trash'].map((filter) => (
          <button
            key={filter}
            onClick={() => setInboxFilter(filter)}
            className={`flex-1 py-2 text-sm rounded-md capitalize transition-colors ${
              inboxFilter === filter 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Quick capture */}
      <div className="flex gap-2 mx-4 mt-4">
        <input
          type="text"
          placeholder="Quick capture..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 text-sm"
        />
        <button className="px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium">
          Add
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-auto mt-4 px-4 space-y-3">
        {inboxItems.map((item) => (
          <div key={item.id} className="bg-slate-800 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm leading-relaxed">{item.content}</p>
                {item.url && (
                  <div className="flex items-center gap-1 mt-2 text-blue-400 text-xs">
                    <Icons.Link />
                    <span className="truncate">{item.url}</span>
                  </div>
                )}
                <p className="text-slate-500 text-xs mt-2">{item.time}</p>
              </div>
              <div className="flex gap-2 text-slate-500">
                <button className="p-1 hover:text-white"><Icons.Clock /></button>
                <button className="p-1 hover:text-white"><Icons.Pin /></button>
                <button className="p-1 hover:text-white"><Icons.Trash /></button>
              </div>
            </div>
            
            {/* Triage actions - swipe hint */}
            <div className="mt-3 pt-3 border-t border-slate-700 flex gap-2">
              <button className="flex-1 py-2 text-xs bg-slate-700 rounded text-slate-300 flex items-center justify-center gap-1">
                <Icons.Desktop />
                To Desktop
              </button>
              <button className="flex-1 py-2 text-xs bg-slate-700 rounded text-slate-300 flex items-center justify-center gap-1">
                <Icons.Browse />
                To Folder
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Tasks View
  const TasksView = () => (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex bg-slate-800/50 rounded-lg p-1 mx-4 mt-4">
        {['today', 'upcoming', 'all'].map((filter) => (
          <button
            key={filter}
            onClick={() => setTaskFilter(filter)}
            className={`flex-1 py-2 text-sm rounded-md capitalize transition-colors ${
              taskFilter === filter 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Task count summary */}
      <div className="mx-4 mt-4 text-slate-400 text-sm">
        {taskFilter === 'today' && '3 tasks for today'}
        {taskFilter === 'upcoming' && '2 tasks coming up'}
        {taskFilter === 'all' && '6 total tasks'}
      </div>

      {/* Tasks list */}
      <div className="flex-1 overflow-auto mt-4 px-4 space-y-2">
        {tasks
          .filter(t => {
            if (taskFilter === 'today') return t.due === 'today';
            if (taskFilter === 'upcoming') return t.due === 'tomorrow' || t.due === 'this week';
            return true;
          })
          .map((task) => (
            <div key={task.id} className="bg-slate-800 rounded-lg p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-slate-500 rounded flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">{task.text}</p>
                <p className="text-slate-500 text-xs mt-1">{task.container}</p>
              </div>
              <Icons.ChevronRight />
            </div>
          ))}
      </div>

      {/* Quick add task */}
      <div className="p-4 border-t border-slate-800">
        <button className="w-full py-3 bg-slate-800 border border-dashed border-slate-600 rounded-lg text-slate-400 text-sm">
          + Add task
        </button>
      </div>
    </div>
  );

  // Browse View
  const BrowseView = () => {
    if (browseView === 'root') {
      return (
        <div className="flex flex-col h-full">
          <div className="mx-4 mt-4 text-slate-400 text-sm">Containers</div>
          <div className="flex-1 overflow-auto mt-4 px-4 space-y-2">
            {/* Desktop */}
            <button
              onClick={() => setBrowseView('desktop')}
              className="w-full bg-slate-800 rounded-lg p-4 flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400">
                <Icons.Desktop />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Desktop</p>
                <p className="text-slate-500 text-xs">4 items active</p>
              </div>
              <Icons.ChevronRight />
            </button>

            {/* Folders */}
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => { setBrowseView('folder'); setSelectedFolder(folder); }}
                className="w-full bg-slate-800 rounded-lg p-4 flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400">
                  <Icons.Browse />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{folder}</p>
                  <p className="text-slate-500 text-xs">12 items</p>
                </div>
                <Icons.ChevronRight />
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Desktop or Folder detail view
    const containerName = browseView === 'desktop' ? 'Desktop' : selectedFolder;
    return (
      <div className="flex flex-col h-full">
        {/* Back header */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <button 
            onClick={() => setBrowseView('root')}
            className="p-2 -ml-2 text-slate-400"
          >
            <Icons.ChevronLeft />
          </button>
          <h2 className="text-white font-medium">{containerName}</h2>
        </div>

        {/* Tab toggle: Tasks | Notes */}
        <div className="flex bg-slate-800/50 rounded-lg p-1 mx-4 mt-4">
          <button className="flex-1 py-2 text-sm rounded-md bg-slate-700 text-white">Tasks</button>
          <button className="flex-1 py-2 text-sm rounded-md text-slate-400">Notes</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto mt-4 px-4 space-y-2">
          {tasks.slice(0, 3).map((task) => (
            <div key={task.id} className="bg-slate-800 rounded-lg p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-slate-500 rounded flex-shrink-0" />
              <p className="text-white text-sm flex-1">{task.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Annotation */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <strong>Mobile Wireframe</strong> — Task-oriented approach with bottom nav. 
        Tap tabs below to explore each view.
      </div>

      {/* Phone frame */}
      <div className="bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800">
        {/* Status bar */}
        <div className="bg-slate-900 px-6 py-2 flex justify-between text-white text-xs">
          <span>9:41</span>
          <div className="flex gap-1">
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>

        {/* App header */}
        <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center text-sm">🐷</div>
            <span className="text-white font-medium">
              {activeTab === 'inbox' && 'Inbox'}
              {activeTab === 'tasks' && 'Tasks'}
              {activeTab === 'browse' && 'Browse'}
            </span>
          </div>
          <button className="text-slate-400 p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Main content area */}
        <div className="h-96 overflow-hidden bg-slate-900">
          {activeTab === 'inbox' && <InboxView />}
          {activeTab === 'tasks' && <TasksView />}
          {activeTab === 'browse' && <BrowseView />}
        </div>

        {/* Bottom navigation */}
        <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex justify-around">
          {[
            { id: 'inbox', icon: Icons.Inbox, label: 'Inbox' },
            { id: 'tasks', icon: Icons.Tasks, label: 'Tasks' },
            { id: 'browse', icon: Icons.Browse, label: 'Browse' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); if (id === 'browse') setBrowseView('root'); }}
              className={`flex flex-col items-center gap-1 ${
                activeTab === id ? 'text-blue-400' : 'text-slate-500'
              }`}
            >
              <Icon />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>

        {/* Home indicator */}
        <div className="bg-slate-900 pb-2 flex justify-center">
          <div className="w-32 h-1 bg-slate-700 rounded-full" />
        </div>
      </div>

      {/* Design notes */}
      <div className="mt-6 space-y-4 text-sm">
        <div className="p-4 bg-slate-100 rounded-lg">
          <div className="font-semibold mb-2">Key Mobile Patterns</div>
          <ul className="space-y-2 text-slate-600">
            <li><strong>Inbox:</strong> Primary capture + triage. "To Desktop" / "To Folder" buttons for quick sorting.</li>
            <li><strong>Tasks:</strong> Cross-container view. Today/Upcoming/All filters. This is the "what do I need to do" view regardless of where tasks live.</li>
            <li><strong>Browse:</strong> Drill-down access to Desktop and Folders. De-emphasized — for when you specifically need to see a container's contents.</li>
          </ul>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="font-semibold mb-2">Triage Interaction Options</div>
          <ul className="space-y-2 text-slate-600">
            <li><strong>Buttons (shown):</strong> Explicit "To Desktop" / "To Folder" — discoverable but takes space.</li>
            <li><strong>Swipe gestures:</strong> Swipe right → Desktop, Swipe left → Folder picker. Faster once learned.</li>
            <li><strong>Long press:</strong> Context menu with all options including snooze, delete, move.</li>
          </ul>
        </div>

        <div className="p-4 bg-green-50 rounded-lg">
          <div className="font-semibold mb-2">Data Sharing with Desktop</div>
          <ul className="space-y-2 text-slate-600">
            <li>Same queries: <code className="bg-green-100 px-1 rounded">useInbox()</code>, <code className="bg-green-100 px-1 rounded">useContainer(id)</code></li>
            <li>New query for Tasks view: <code className="bg-green-100 px-1 rounded">useAllTasks(filter)</code> — aggregates across containers</li>
            <li>Triage actions dispatch same mutations as desktop</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default YoinkMobileWireframe;