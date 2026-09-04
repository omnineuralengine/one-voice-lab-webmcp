"use client";

import Link from "next/link";
import { useState } from "react";

import { OneConciergeTrigger } from "@/components/concierge/OneConciergeTrigger";
import { useOneExperience } from "@/components/one/OneExperienceProvider";

export function OneHeaderControls() {
  const { authConfigured, authReady, user, unreadCount, updates, isUpdateRead, markUpdateRead, markAllUpdatesRead } = useOneExperience();
  const [open, setOpen] = useState(false);
  const checkingAccount = authConfigured && !authReady;

  return (
    <div className="one-header-controls">
      <OneConciergeTrigger />
      <Link className="voice-open-nav__command one-feedback-link" href="/feedback">Feedback</Link>
      <details className="one-notification-center" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary aria-label={`${unreadCount} unread ONE updates`}>
          <span aria-hidden="true">◉</span><span className="one-notification-center__count">{unreadCount}</span>
        </summary>
        {open ? (
          <div className="one-notification-center__panel">
            <header><div><small>ONE system</small><strong>What&apos;s New</strong></div><button type="button" onClick={() => void markAllUpdatesRead()}>Mark all read</button></header>
            <ul>
              {updates.map((item) => (
                <li data-read={isUpdateRead(item.id)} key={item.id}>
                  <div><small>{item.category} · {new Date(item.publishedAt).toLocaleDateString()}</small><strong>{item.title}</strong><p>{item.summary}</p></div>
                  <Link href={item.href} onClick={() => void markUpdateRead(item.id)}>Open</Link>
                </li>
              ))}
            </ul>
            <Link className="one-notification-center__settings" href="/settings#notifications">Notification preferences</Link>
          </div>
        ) : null}
      </details>
      <Link aria-busy={checkingAccount} className="one-identity-link" href="/settings#identity">
        <span aria-hidden="true" className="one-identity-link__dot" data-active={Boolean(user)} />
        <span aria-live="polite"><strong>{checkingAccount ? "Checking account" : user ? "ONE identity" : "Guest"}</strong><small>{checkingAccount ? "Verifying this session" : user ? "Personalization synced" : authConfigured ? "Save & personalize" : "Local-first mode"}</small></span>
      </Link>
    </div>
  );
}
