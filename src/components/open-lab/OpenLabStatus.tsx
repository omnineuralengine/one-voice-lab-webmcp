export function OpenLabStatus({ liveEnabled }: { liveEnabled: boolean }) {
  return (
    <aside
      aria-label={`Open Lab status. Shared live Deepgram project. ${liveEnabled ? "Live execution enabled." : "Provider paused; learning tools available."} Do not submit confidential or regulated information.`}
      className="open-lab-status"
      data-live-enabled={liveEnabled ? "true" : "false"}
    >
      <span className="open-lab-status__eyebrow">OPEN LAB</span>
      <span className="open-lab-status__project">
        <span aria-hidden="true" className="open-lab-status__dot" />
        <span className="open-lab-status__project-label open-lab-status__project-label--full">Shared live Deepgram project · {liveEnabled ? "live execution enabled" : "provider paused; learning tools available"}</span>
        <span className="open-lab-status__project-label open-lab-status__project-label--compact">Deepgram {liveEnabled ? "live" : "paused"}</span>
      </span>
      <span className="open-lab-status__privacy open-lab-status__privacy--full">Do not submit confidential or regulated information</span>
      <span className="open-lab-status__privacy open-lab-status__privacy--compact">No private data</span>
    </aside>
  );
}
