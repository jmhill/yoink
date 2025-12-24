import React, { useState } from 'react';

const YoinkPanesWireframe = () => {
  const [activePane, setActivePane] = useState('inbox');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [phase, setPhase] = useState(2);

  const folders = ['Projects', 'Reference', 'Someday', 'Archive'];

  const CollapsedBar = ({ label, onClick, side, children }) => (
    <div
      onClick={onClick}
      className={`w-12 bg-gray-100 border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors ${
        side === 'left' ? 'border-r' : 'border-l'
      }`}
    >
      <span className="writing-mode-vertical text-gray-600 font-medium text-sm tracking-wide"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: side === 'left' ? 'rotate(180deg)' : 'none' }}>
        {label}
      </span>
      {children}
    </div>
  );

  const FolderListBar = ({ onFolderClick }) => (
    <div className="w-48 bg-gray-50 border-l border-gray-300 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Folders</span>
      </div>
      <div className="flex-1 overflow-auto">
        {folders.map((folder) => (
          <div
            key={folder}
            onClick={() => onFolderClick(folder)}
            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
          >
            {folder}
          </div>
        ))}
      </div>
    </div>
  );

  const InboxContent = () => (
    <div className="flex-1 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Inbox</h2>
      <p className="text-sm text-gray-500 mb-4">Unsorted captures land here</p>
      <div className="space-y-2">
        {['Quick thought about API design...', 'Link: article on DX patterns', 'Meeting note: sync with team', 'Idea for folder structure'].map((item, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );

  const ContainerView = ({ name, isDesktop = false }) => {
    const [taskFilter, setTaskFilter] = useState('today');
    
    // Desktop tasks vary by filter; folder tasks are always just that folder's tasks
    const desktopTasks = {
      today: [
        { text: 'Review PR #234', source: null },
        { text: 'Call accountant', source: null },
        { text: 'Finalize Q1 roadmap', source: 'Projects' },
        { text: 'Book travel for conference', source: 'Someday' },
      ],
      upcoming: [
        { text: 'Team sync prep', source: null },
        { text: 'Submit expense report', source: null },
        { text: 'Review contractor proposals', source: 'Projects' },
        { text: 'Dentist appointment', source: 'Reference' },
      ],
      all: [
        { text: 'Update API docs', source: null },
        { text: 'Deploy staging', source: null },
        { text: 'Refactor auth module', source: null },
        { text: 'Write blog post draft', source: null },
      ],
    };
    
    const folderTasks = [
      { text: 'Finalize Q1 roadmap', source: null },
      { text: 'Review contractor proposals', source: null },
      { text: 'Update project timeline', source: null },
    ];
    
    const tasks = isDesktop ? desktopTasks[taskFilter] : folderTasks;
    
    const notes = isDesktop
      ? ['Architecture decisions for auth flow', 'Sprint retrospective notes']
      : ['Reference doc: API patterns', 'Meeting notes from Q3 planning'];

    return (
      <div className="flex-1 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{name}</h2>
          <p className="text-xs text-gray-500">
            {isDesktop ? 'Active items you\'re working with' : 'Items filed in this folder'}
          </p>
        </div>
        
        {/* Two-column content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Task List - Left Column */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            {/* Task header with filter tabs for Desktop */}
            {isDesktop ? (
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1">
                  {['today', 'upcoming', 'all'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTaskFilter(filter)}
                      className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                        taskFilter === filter
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {taskFilter === 'today' && 'Due today from Desktop + Folders'}
                  {taskFilter === 'upcoming' && 'Coming up from Desktop + Folders'}
                  {taskFilter === 'all' && 'All unfiled Desktop tasks'}
                </p>
              </div>
            ) : (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</span>
              </div>
            )}
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700">
                  <div className="w-4 h-4 mt-0.5 border-2 border-gray-400 rounded flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span>{task.text}</span>
                    {task.source && (
                      <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-600 text-xs rounded">
                        {task.source}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Notes - Right Column */}
          <div className="w-1/2 flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</span>
              {isDesktop && <p className="text-xs text-gray-400 mt-1">Unfiled notes</p>}
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {notes.map((note, i) => (
                <div key={i} className="p-3 bg-amber-50 rounded border border-amber-200 text-sm text-gray-700">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 bg-amber-300 rounded" />
                    <span className="text-xs text-gray-500">Note</span>
                  </div>
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Phase Toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => { setPhase(1); setActivePane('inbox'); setSelectedFolder(null); }}
          className={`px-3 py-1 text-sm rounded ${phase === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Phase 1
        </button>
        <button
          onClick={() => { setPhase(2); setActivePane('inbox'); setSelectedFolder(null); }}
          className={`px-3 py-1 text-sm rounded ${phase === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Phase 2
        </button>
        <span className="text-sm text-gray-500 ml-2 self-center">
          {phase === 1 ? 'Inbox ↔ Desktop' : 'Inbox ↔ Desktop ↔ Folder'}
        </span>
      </div>

      {/* Current State Indicator */}
      <div className="mb-2 text-xs text-gray-500">
        Current: <span className="font-mono bg-gray-100 px-1 rounded">{activePane}</span>
        {selectedFolder && <span className="ml-1">→ {selectedFolder}</span>}
      </div>

      {/* Main Wireframe Container */}
      <div className="border-2 border-gray-400 rounded-lg overflow-hidden h-96 flex bg-gray-50">
        
        {/* INBOX VIEW */}
        {activePane === 'inbox' && (
          <>
            <InboxContent />
            <CollapsedBar 
              label="Desktop" 
              side="right" 
              onClick={() => setActivePane('desktop')} 
            />
          </>
        )}

        {/* DESKTOP VIEW */}
        {activePane === 'desktop' && (
          <>
            <CollapsedBar 
              label="Inbox" 
              side="left" 
              onClick={() => setActivePane('inbox')} 
            />
            <ContainerView name="Desktop" isDesktop={true} />
            {phase === 2 && (
              <FolderListBar onFolderClick={(folder) => { setSelectedFolder(folder); setActivePane('folder'); }} />
            )}
          </>
        )}

        {/* FOLDER VIEW (Phase 2 only) */}
        {activePane === 'folder' && phase === 2 && (
          <>
            <CollapsedBar 
              label="Inbox" 
              side="left" 
              onClick={() => setActivePane('inbox')} 
            />
            <CollapsedBar 
              label="Desktop" 
              side="left" 
              onClick={() => setActivePane('desktop')} 
            />
            <ContainerView name={selectedFolder} isDesktop={false} />
          </>
        )}
      </div>

      {/* Navigation Pattern Legend */}
      <div className="mt-4 p-4 bg-gray-100 rounded text-sm">
        <div className="font-semibold mb-2">Navigation Pattern</div>
        <ul className="space-y-1 text-gray-600">
          <li>• Click collapsed bars to navigate between panes</li>
          <li>• Only one pane expanded at a time</li>
          <li>• Desktop and Folder share the same layout: Tasks (left) | Notes (right)</li>
          <li>• <strong>Desktop Tasks:</strong> Today/Upcoming aggregate from all containers; All shows unfiled only</li>
          <li>• <strong>Desktop Notes:</strong> Unfiled notes only (no aggregation)</li>
          <li>• <strong>Folder views:</strong> Scoped to that folder's tasks and notes only</li>
          <li>• Tasks from folders show a source tag (e.g. [Projects])</li>
          <li>• Phase 2: Folder list appears in right bar when on Desktop</li>
        </ul>
      </div>

      {/* State Diagram */}
      <div className="mt-4 p-4 bg-white border border-gray-300 rounded">
        <div className="font-semibold mb-2 text-sm">State Transitions</div>
        <pre className="text-xs text-gray-600 font-mono">
{phase === 1 ? 
`┌───────────────────────────────────────────┐
│  [INBOX]        │  Desktop →  │           │
│                 │  (bar)      │           │
└───────────────────────────────────────────┘
                       ↓ click
┌───────────────────────────────────────────┐
│ ← Inbox │ Tasks            │ Notes        │
│  (bar)  │ [today][soon][all│ (unfiled)    │
│         │ ──────────────── │              │
│         │ □ task 1         │ ┌─────────┐  │
│         │ □ task 2 [Proj]  │ │ note    │  │
│         │ □ task 3 [Ref]   │ └─────────┘  │
└───────────────────────────────────────────┘
  today/upcoming = aggregated from all containers
  all = desktop-only unfiled tasks`
:
`┌───────────────────────────────────────────┐
│  [INBOX]        │  Desktop →  │           │
│                 │  (bar)      │           │
└───────────────────────────────────────────┘
                       ↓ click
┌───────────────────────────────────────────┐
│ ← Inbox │ Tasks            │ Notes  │Fldrs│
│  (bar)  │ [today][soon][all│(unfiled│•Proj│
│         │ ──────────────── │        │•Ref │
│         │ □ task 1         │┌─────┐ │•etc │
│         │ □ task 2 [Proj]  ││note │ │     │
│         │ □ task 3 [Ref]   │└─────┘ │     │
└───────────────────────────────────────────┘
                                     ↓ click folder
┌───────────────────────────────────────────┐
│←Inbox│←Desk│ Tasks          │ Notes       │
│(bar) │(bar)│ (this folder)  │(this folder)│
│      │     │ □ folder task 1│ ┌─────────┐ │
│      │     │ □ folder task 2│ │ note    │ │
│      │     │                │ └─────────┘ │
└───────────────────────────────────────────┘
  folder view = scoped to that folder only`}`
        </pre>
      </div>
    </div>
  );
};

export default YoinkPanesWireframe;