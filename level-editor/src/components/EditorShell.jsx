import { useState } from 'react';

const SECTIONS = [
  {
    id: 'levels',
    label: 'Levels',
    kicker: 'Daily catalog',
    title: 'Level authoring',
    description:
      'Calendar, generated previews, custom overrides, and Word-Guess editing will live here.',
    tasks: [
      'Load games and date-range status after the schema milestone.',
      'Preview generated and custom level content before save.',
      'Surface duplicate-answer warnings for Word-Guess levels.',
    ],
  },
  {
    id: 'assets',
    label: 'Assets',
    kicker: 'Object keys',
    title: 'Asset library',
    description:
      'Uploads, metadata, picker UI, and short-lived view URL checks will live here.',
    tasks: [
      'Persist object_key values, never public URLs.',
      'Resolve one-hour view URLs only when an editor needs to preview an asset.',
      'Sync level_asset_refs from object keys stored in level content.',
    ],
  },
  {
    id: 'service-tokens',
    label: 'Service Tokens',
    kicker: 'Runtime access',
    title: 'Service token management',
    description:
      'Owner-created read tokens for Mushy Game runtime catalog access will live here.',
    tasks: [
      'Create scoped tokens for catalog:read and asset:read.',
      'Show raw tokens once, then store only a hash.',
      'List and revoke tokens without requiring editor passwords in Mushy Game.',
    ],
  },
];

export function EditorShell({ session, signingOut, user, onSignOut }) {
  const [activeSectionId, setActiveSectionId] = useState(SECTIONS[0].id);
  const activeSection = SECTIONS.find((section) => section.id === activeSectionId) || SECTIONS[0];

  return (
    <section className="editor-shell" aria-label="Level editor workspace">
      <header className="shell-header">
        <div>
          <p className="eyebrow">Milestone 1 shell</p>
          <h2>Editor workspace</h2>
          <p>
            The authenticated owner shell is ready. Future milestones can replace each placeholder
            panel independently without changing the login flow.
          </p>
        </div>
        <div className="shell-account">
          <strong>{user.email}</strong>
          <span>{user.id}</span>
          {session?.expires_at && (
            <small>Session expires {new Date(session.expires_at * 1000).toLocaleString()}</small>
          )}
          <button className="button secondary" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </header>

      <nav className="shell-tabs" aria-label="Editor sections">
        {SECTIONS.map((section) => (
          <button
            aria-pressed={section.id === activeSection.id}
            className={`shell-tab ${section.id === activeSection.id ? 'active' : ''}`}
            key={section.id}
            onClick={() => setActiveSectionId(section.id)}
            type="button"
          >
            <span>{section.kicker}</span>
            {section.label}
          </button>
        ))}
      </nav>

      <article className="shell-panel">
        <div>
          <p className="eyebrow">{activeSection.kicker}</p>
          <h3>{activeSection.title}</h3>
          <p>{activeSection.description}</p>
        </div>
        <ul className="panel-task-list">
          {activeSection.tasks.map((task) => (
            <li key={task}>{task}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}
