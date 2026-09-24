import React, { useId, useRef, useState } from 'react';
import {
  Badge, Button, Checkbox, Dropdown, Field, MessageBar, MessageBarBody, MessageBarTitle,
  Option, Radio, RadioGroup, Text, Textarea,
} from '@fluentui/react-components';
import { ArrowLeftRegular, CommentRegular } from '@fluentui/react-icons';
import { useCanvasStyles } from './styles.js';
import { authorityKey, packRequestPending, requestKey } from './use-canvas-data.js';

export function Notice({ title, children, intent = 'info', focusRef }) {
  const s = useCanvasStyles();
  return <MessageBar intent={intent} layout="multiline" className={s.notice}
    ref={focusRef} tabIndex={focusRef ? -1 : undefined} aria-label={focusRef ? 'Response status' : undefined}>
    <MessageBarBody>{title && <MessageBarTitle>{title}</MessageBarTitle>}{children}</MessageBarBody>
  </MessageBar>;
}

export function SelectField({ label, value, options, onChange, disabled = false }) {
  const s = useCanvasStyles();
  return <Field label={label}>
    <Dropdown className={s.control} value={options.find(([id]) => id === value)?.[1] || ''}
      selectedOptions={value ? [value] : []} placeholder="Choose an option" disabled={disabled}
      onOptionSelect={(_, data) => onChange(data.optionValue)}>
      {options.map(([id, text]) => <Option key={id} value={id} text={text}>{text}</Option>)}
    </Dropdown>
  </Field>;
}

const CLASSES = {
  onboarding: 'Getting started', fact: 'Clarification', preview: 'Design review',
  manual_observation: 'Host observation', permission: 'Permission', scope_choice: 'Scope choice',
};
const PHASES = {
  publishing: 'Checking the source', pending: 'Current request', responding: 'Responding',
  awaiting_acknowledgment: 'Awaiting acknowledgment', accepted: 'Accepted', applied: 'Applied',
  permission_acknowledged: 'Permission acknowledged',
  declined: 'Declined', deferred: 'Deferred', source_changed: 'Stale context',
  outside_input_available: 'Outside input received', cancelled: 'Cancelled',
  unavailable: 'Unavailable', uncertain: 'Delivery uncertain', capture_intent: 'Capture requested',
  sending: 'Awaiting capture delivery', issued: 'Capture prepared',
};

export function matchesRequestScope(context, scope) {
  return Boolean(context && scope && scope.ideaPath === context.ideaPath
    && (scope.kind === 'idea' || (scope.kind === 'feature' && scope.specPath === context.specPath)));
}

// A contextual shortcut uses the admitted request, not task state or a preview
// path. Partial coverage elsewhere does not hide this owner's current request.
export function currentRequests(context, data) {
  const feed = data.needs;
  if (!context || ['stale', 'unavailable'].includes(context.coverage?.state)
    || !feed || data.issues.needs || feed.coverage.state === 'unavailable'
    || (data.index && data.index.workspaceId !== feed.workspaceId)) return [];
  return feed.requests.filter(record => record.phase === 'pending'
    && matchesRequestScope(context, record.request.scope));
}

// One eligibility rule for Overview, Context and the current preview form.
// The admitted provider request proves canonical artifact ownership; preview_path
// alone, a task mentioning design, and old approvals do not supply entry.
export function previewEligibility(context, data) {
  if (context?.status === 'resolved') {
    return { records: [], reason: 'This resolved idea has no canonical design package. Viewing it does not reopen work.' };
  }
  if (!context || context.kind !== 'feature' || context.status !== 'defined' || !context.specPath) {
    return { records: [], reason: context?.status === 'draft'
      ? 'Define this draft explicitly before creating a canonical mock or review storage.'
      : 'Review requires a current, exactly owned definition. Its ownership is not established here.' };
  }
  if (['stale', 'unavailable'].includes(context.coverage?.state)) {
    return { records: [], reason: 'The exact context source is unavailable. Review needs current ownership.' };
  }
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable' || !feed.review?.available
    || (data.index && data.index.workspaceId !== feed.workspaceId)) {
    return { records: [], reason: 'The current preview owner or Review capability is unavailable.' };
  }
  const records = feed.requests.filter(record => record.phase === 'pending'
    && record.request.class === 'preview' && record.request.scope.kind === 'feature'
    && record.request.scope.ideaPath === context.ideaPath && record.request.scope.specPath === context.specPath);
  return { records, reason: records.length ? null : 'No current owner-qualified preview request is waiting for this record.' };
}

export function scopeLabel(scope) {
  return scope.kind === 'session' ? 'This session · no canonical idea'
    : scope.kind === 'feature' ? scope.specPath : scope.ideaPath;
}

export function ScopeIdentity({ scope, title, browsingLabel }) {
  const s = useCanvasStyles();
  return <div className={s.tight}>
    <Text weight="semibold">{title || scopeLabel(scope)}</Text>
    {scope.kind !== 'session' && <Text className={s.code}>
      {scope.ideaPath}{scope.kind === 'feature' ? `\n${scope.specPath}` : ''}
    </Text>}
    {browsingLabel && <Text className={s.eyebrow}>You are browsing {browsingLabel}.
      {' '}Your work selection stays separate from this scope.</Text>}
  </div>;
}

function exceedsTextLimit(value, data) {
  return new TextEncoder().encode(value).length > data.needs.limits.textBytes;
}

// The Dude-owned session permission for a Settings pack request (see
// packPermission). Other owners' permissions keep their ordinary semantics.
const isPackPermission = request => request?.class === 'permission' && request.owner === 'dude'
  && request.requestRef.startsWith('pack:') && String(request.fields?.operation).startsWith('pack:');

// A canvas_response acknowledges the permission, not the separate pack_result.
// Only the pack request view establishes an applied operation from that result
// and its agreeing current installed authority.
function responsePhase(record, phase) {
  return phase === 'applied' && isPackPermission(record?.request) ? 'permission_acknowledged' : phase;
}

export function ResponseStatus({ record, attempt, draft = false, capture = false, focusRef }) {
  const s = useCanvasStyles();
  const receipt = record?.receipt || attempt?.receipt;
  const acknowledgment = receipt?.acknowledgment;
  const prior = acknowledgment && !receipt.current;
  const phase = responsePhase(record, acknowledgment?.outcome || (record?.phase !== 'pending' ? record?.phase : null)
    || attempt?.phase || (draft ? 'responding' : 'pending'));
  const saved = capture && record?.saved && acknowledgment?.outcome === 'applied'
    && receipt.current && receipt.reread?.canonicalIdeaPath;
  const title = saved ? 'Idea saved' : prior ? `Previously recorded: ${PHASES[phase] || phase}`
    : PHASES[phase] || 'Capture status';
  const intent = prior ? 'warning' : ['applied', 'accepted'].includes(phase) ? 'success'
    : ['stale', 'source_changed', 'unavailable', 'uncertain', 'declined', 'cancelled'].includes(phase) ? 'warning' : 'info';
  const copy = {
    pending: 'The current owner is waiting for your response.',
    responding: attempt ? 'Sending this response. Do not submit it again.' : 'Your response is unsent and stays in this tab.',
    awaiting_acknowledgment: 'Sent to the joined owner. Acceptance and application are not yet confirmed.',
    accepted: 'The owner accepted this response. Application is not yet confirmed.',
    applied: 'The owner confirmed application and reread the source.',
    permission_acknowledged: 'The owner acknowledged this permission response. Check the pack request for a verified operation result.',
    declined: 'The owner declined this response. A fresh request is needed before responding again.',
    deferred: record?.durable
      ? 'The owner recorded a source-backed deferral. It remains discoverable in the recorded context.'
      : 'This deferral is not confirmed as durable. No idea was created; the session request will not be restored after restart.',
    source_changed: 'The source changed. Your unsent text is retained, but this request cannot accept it.',
    outside_input_available: 'The owner must recognize the outside answer or publish a fresh request. Canvas has not applied it.',
    cancelled: 'The original invocation was cancelled. Your input is retained; it will not be resent.',
    capture_intent: 'The selected intent was handed to brainstorm. This did not answer or grant permission for the original request.',
    unavailable: 'Current authority is unavailable. Your input is retained and will not be sent automatically.',
    uncertain: 'Delivery could not be confirmed. Reconcile with the owner before any further send.',
    sending: 'Capture delivery is being reconciled. No saved result is confirmed yet.',
    issued: 'Capture was prepared. Nothing has been sent or saved.',
  };
  const attemptMessage = !record || ['pending', 'publishing', attempt?.phase].includes(record.phase) ? attempt?.message : null;
  return <Notice title={title} intent={intent} focusRef={focusRef}>
    <div className={s.tight}>
      <Text>{saved ? 'The owner acknowledged capture and Canvas reread the canonical idea.'
        : prior ? 'This is a recorded past outcome. Its source or provider is no longer current; that does not undo the earlier capture or application.'
          : attemptMessage || copy[phase] || 'Current owner confirmation is required.'}</Text>
      {acknowledgment?.note && <p className={s.prose}>{acknowledgment.note}</p>}
      {receipt?.reread?.canonicalIdeaPath && <Text className={s.code}>{receipt.reread.canonicalIdeaPath}</Text>}
    </div>
  </Notice>;
}

export function NewIdea({ value, onChange, onCancel, data }) {
  const s = useCanvasStyles();
  const [validation, setValidation] = useState('');
  const feed = data.needs, key = `${authorityKey(feed)}|capture|new`;
  const attempt = data.attempts[key];
  const candidate = feed?.captures.find(item => item.captureReceipt === attempt?.captureReceipt);
  const otherCapture = candidate?.intent !== null && candidate
    && (candidate.intent !== attempt?.intent || candidate.continuation !== attempt?.continuation);
  const capture = otherCapture ? null : candidate;
  const unreconciled = feed?.captures.some(item => !item.receipt.acknowledgment && item.phase !== 'unavailable'
    && !(item.phase === 'issued' && item.captureReceipt === attempt?.captureReceipt && attempt.retryable));
  const packWaiting = packRequestPending(data);
  const idle = feed && !data.issues.needs && feed.coverage.state !== 'unavailable'
    && feed.capture.idle && !feed.capture.waitingRequests.length && !unreconciled && !packWaiting;
  const refusedBeforeSend = candidate?.phase === 'unavailable' && candidate.reason === 'idle_required';
  const locked = attempt && !attempt.retryable && !refusedBeforeSend
    && !(otherCapture && candidate.receipt.acknowledgment) && (!capture?.saved || value === attempt.intent);
  const submit = continuation => {
    if (!value.trim()) { setValidation('Enter an idea before submitting or saving.'); return; }
    if (exceedsTextLimit(value, data)) {
      setValidation(`This exceeds the provider's ${feed.limits.textBytes.toLocaleString()} UTF-8 byte limit. Edit it before sending; nothing has been truncated or prepared.`);
      return;
    }
    setValidation('');
    void data.capture(value, continuation);
  };
  return <div className={s.measure}>
    <header className={s.detailHeader}>
      <h1 className={s.title}>New idea</h1>
      <p className={s.lead}>What would you like to make?</p>
      <p className={s.prose}>Describe the outcome in your own words. Submit captures it and continues brainstorming.
        Save captures it for later, without further discussion, definition, or execution.</p>
      <Text className={s.eyebrow}>New idea is unfiled. Your work selection is not attached to this draft.</Text>
    </header>
    <Field label="Your idea" validationState={validation ? 'error' : 'none'} validationMessage={validation || undefined}>
      <Textarea value={value} className={s.control} resize="vertical" rows={7}
        onChange={(_, input) => { onChange(input.value); setValidation(''); }} />
    </Field>
    <div className={s.actions}>
      <Button appearance="primary" disabled={!idle || Boolean(locked)} onClick={() => submit('brainstorm')}>Submit</Button>
      <Button disabled={!idle || Boolean(locked)} onClick={() => submit('capture_only')}>Save</Button>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
    {otherCapture ? <Notice title="Another capture used this receipt" intent="warning">
      Your draft was not the intent recorded by this receipt. Nothing will be sent automatically.
    </Notice> : (attempt || capture) && <ResponseStatus record={capture} attempt={attempt} capture />}
    {!idle && (!attempt || capture?.saved) && <Notice title="Waiting for the joined agent">
      {data.issues.needs || (packWaiting ? 'A pack request is in progress or needs owner reconciliation. Your idea draft stays here.'
        : feed?.capture.waitingRequests.length
        ? 'Another request is waiting. Respond in Needs you first; New idea will not interrupt or bind itself to that request.'
        : 'Capture requires a current idle session with no unreconciled capture. Your draft stays here.')}
    </Notice>}
    <Text className={s.eyebrow}>Cancel returns to Needs you and keeps your text in this tab. It does not undo a submission. Reloading clears the local draft.</Text>
  </div>;
}

function RequestForm({ record, data, value, onChange, onReview, reviewed }) {
  const s = useCanvasStyles();
  const request = record.request, fields = request.fields;
  const statusFocus = useRef(null);
  const pack = isPackPermission(request);
  const [error, setError] = useState('');
  const attempt = data.attempts[requestKey(data.needs, record)];
  const busy = Boolean(attempt && !attempt.retryable) || record.responding || record.reviewing;
  const current = record.phase === 'pending' && data.needs?.coverage.state !== 'unavailable' && !data.issues.needs;
  const disabled = !current || busy;
  const set = change => { setError(''); onChange({ ...value, ...change }); };
  const send = response => {
    if (response.text && exceedsTextLimit(response.text, data)) {
      setError("The response exceeds the provider's UTF-8 byte limit. Edit it before sending; your text has not been truncated.");
      return;
    }
    setError('');
    // Move before the consumed permission controls become disabled/removed.
    if (pack) statusFocus.current?.focus();
    void data.respond(record, response);
  };
  const requireText = text => {
    if (text?.trim()) {
      if (!exceedsTextLimit(text, data)) return true;
      setError("The response exceeds the provider's UTF-8 byte limit. Edit it before sending; your text has not been truncated.");
      return false;
    }
    setError('Enter the requested response. Your wording will be sent unchanged.');
    return false;
  };
  const submit = event => {
    event.preventDefault();
    if (disabled) return;
    if (request.class === 'fact' || request.class === 'onboarding') {
      if (fields.input.kind === 'text') {
        if (requireText(value.text)) send({ class: request.class, action: 'answer', text: value.text });
      } else if (fields.input.options.some(option => option.id === value.option)) {
        send({ class: request.class, action: 'choose', optionId: value.option });
      } else setError('Choose one of the owner-supplied options.');
    } else if (request.class === 'manual_observation') {
      if (requireText(value.text)) send({ class: request.class, action: value.result || 'observation', text: value.text,
        evidence: value.includeSource && request.source.kind === 'file'
          ? [{ path: request.source.path, revision: request.source.revision }] : [] });
    } else if (request.class === 'permission') {
      if (!value.assent || value.confirmation !== fields.confirmation) {
        setError('Confirm the exact operation and enter the current literal confirmation. Copying the text alone is not permission.');
      } else send({ class: 'permission', action: 'consent', operation: fields.operation,
        targets: fields.targets, confirmation: value.confirmation });
    } else if (request.class === 'scope_choice') {
      if (value.clarify) {
        if (requireText(value.text)) send({ class: 'scope_choice', action: 'clarify', text: value.text });
      } else if (fields.options.some(option => option.id === value.option)) {
        send({ class: 'scope_choice', action: 'choose', optionId: value.option,
          ...(value.text?.trim() ? { text: value.text } : {}) });
      } else setError('Choose an alternative or ask for clarification.');
    }
  };
  const textField = (label = 'Your response') => <Field label={label}>
    <Textarea className={s.control} value={value.text || ''} rows={5} resize="vertical"
      disabled={disabled} onChange={(_, input) => set({ text: input.value })} />
  </Field>;
  const sourceBacked = request.scope.kind !== 'session';
  const captureKey = `${authorityKey(data.needs)}|capture|${record.requestHandle}`;
  const captureAttempt = data.attempts[captureKey];
  const captured = data.needs.captures.find(item => item.captureReceipt === captureAttempt?.captureReceipt
    && item.intent === captureAttempt?.intent && item.continuation === captureAttempt?.continuation);
  const preview = request.class === 'preview' ? previewEligibility({
    kind: 'feature', status: 'defined', ...request.scope,
  }, data) : null;
  return <div className={s.stack}>
    <ResponseStatus record={record} attempt={attempt} focusRef={pack ? statusFocus : undefined}
      draft={Object.values(value).some(entry => typeof entry === 'string' ? Boolean(entry) : entry === true)} />
    <form className={s.stack} onSubmit={submit}>
      {(request.class === 'fact' || request.class === 'onboarding') && (fields.input.kind === 'text' ? textField()
        : <SelectField label="Your answer" value={value.option} disabled={disabled}
          options={fields.input.options.map(option => [option.id, option.label])} onChange={option => set({ option })} />)}
      {request.class === 'manual_observation' && <>
        <Notice title="Human-only step">{fields.automationUnavailable}</Notice>
        <ol>{fields.steps.map((step, index) => <li key={index}><p className={s.prose}>{step}</p></li>)}</ol>
        <p className={s.prose}>{fields.evidenceRequired}</p>
        <SelectField label="Result" value={value.result || 'observation'} disabled={disabled}
          options={[[ 'observation', 'Observation' ], [ 'completed', 'Completed the steps' ], [ 'problem', 'Problem' ]]}
          onChange={result => set({ result })} />
        {textField('What you observed')}
        {request.source.kind === 'file' ? <Checkbox checked={Boolean(value.includeSource)} disabled={disabled}
          onChange={(_, input) => set({ includeSource: input.checked === true })}
          label={`Include the supplied source revision: ${request.source.path} (${request.source.revision})`} />
          : <Text className={s.eyebrow}>No file revision was supplied. Report your observation; the owner verifies the result.</Text>}
      </>}
      {request.class === 'permission' && <>
        <section className={s.scope} aria-label="Exact operation">
          <Text weight="semibold">{fields.operation}</Text>
          <ol>{fields.targets.map((target, index) => <li key={index}>
            <p className={s.code}>{target.target}{'\n'}Revision: {target.revision}</p>
          </li>)}</ol>
          <p className={s.prose}>{fields.consequences}</p>
          <Text weight="semibold">Owner eligibility context</Text><p className={s.prose}>{fields.eligibility}</p>
        </section>
        {current && <>
          <Field label="Required literal confirmation">
            <p className={s.code}>{fields.confirmation}</p>
          </Field>
          <Field label="Enter the exact confirmation">
            <Textarea className={s.control} value={value.confirmation || ''} autoComplete="off" disabled={disabled}
              onChange={(_, input) => set({ confirmation: input.value })} />
          </Field>
          <Checkbox checked={Boolean(value.assent)} disabled={disabled}
            onChange={(_, input) => set({ assent: input.checked === true })}
            label="I grant permission for this operation on these exact targets." />
        </>}
        <Text className={s.eyebrow}>The operation owner revalidates safety and executes or refuses. Canvas does not execute this operation.</Text>
      </>}
      {request.class === 'scope_choice' && <>
        <RadioGroup aria-label="Response type" value={value.clarify ? 'clarify' : 'choose'} disabled={disabled}
          onChange={(_, input) => set({ clarify: input.value === 'clarify' })}>
          <Radio value="choose" label="Choose an alternative" />
          <Radio value="clarify" label="Ask for clarification" />
        </RadioGroup>
        {fields.options.map(option => <section key={option.id} className={s.tight}>
          <Text weight="semibold">{option.label}</Text><p className={s.prose}>{option.consequence}</p>
        </section>)}
        {!value.clarify && <SelectField label="Alternative" value={value.option} disabled={disabled}
          options={fields.options.map(option => [option.id, option.label])} onChange={option => set({ option })} />}
        {textField(value.clarify ? 'What needs clarification?' : 'Additional context (optional)')}
      </>}
      {request.class === 'preview' && <>
        <Text className={s.code}>{fields.artifact.path}{'\n'}Revision: {fields.artifact.revision}</Text>
        <p className={s.prose}>Open the exact canonical mock in Review. Annotations ask the design owner for a revision.
          Approving this revision is a separate response.</p>
        {preview.records.some(item => item.requestHandle === record.requestHandle)
          ? <Button className={s.back} data-review-entry={record.requestHandle} icon={<CommentRegular />} disabled={disabled}
            onClick={onReview}>Open Review</Button>
          : <Notice title="Review unavailable">{preview.reason}</Notice>}
        {!reviewed && <Text className={s.eyebrow}>View this exact revision before approving it. A changed source clears that confirmation.</Text>}
        <Checkbox label="I approve the exact revision I reviewed." checked={Boolean(value.approval && reviewed)}
          disabled={disabled || !reviewed} onChange={(_, input) => set({ approval: input.checked === true })} />
        <Button className={s.back} appearance="primary" disabled={disabled || !reviewed || !value.approval}
          onClick={() => send({ class: 'preview', action: 'approve', artifactRevision: fields.artifact.revision })}>
          Approve this revision
        </Button>
      </>}
      {error && <Notice intent="error" title="Response not sent">{error}</Notice>}
      {request.class !== 'preview' && <div className={s.actions}>
        <Button type="submit" appearance="primary" disabled={disabled}>
          {request.class === 'permission' ? 'Send permission' : 'Send response'}
        </Button>
        {request.class === 'permission' && <Button disabled={disabled} onClick={() => set({ declining: !value.declining })}>Decline</Button>}
      </div>}
    </form>
    {value.declining && current && <section className={s.stack} aria-label="Decline permission">
      {textField('Reason for declining')}
      <Button className={s.back} disabled={disabled} onClick={() => {
        if (requireText(value.text)) send({ class: 'permission', action: 'decline', text: value.text });
      }}>Send decline</Button>
    </section>}
    {current && <section className={s.stack} aria-label="Deferral">
      <Button className={s.back} disabled={disabled} onClick={() => set({ deferring: !value.deferring })}>Defer</Button>
      {value.deferring && <>
        <Notice title={sourceBacked ? 'Request a source-backed deferral' : 'This matter is not saved'}>
          {sourceBacked ? 'The owner must record and acknowledge the disposition in its existing source. Defer does not duplicate this idea.'
            : 'Defer does not capture an idea or promise to restore this request after restart. Use Save as idea below to retain selected intent explicitly.'}
        </Notice>
        <Field label="Deferral note (optional)"><Textarea value={value.deferText || ''} className={s.control}
          disabled={disabled} onChange={(_, input) => set({ deferText: input.value })} /></Field>
        <Button className={s.back} disabled={disabled} onClick={() => send({ class: request.class, action: 'defer',
          ...(value.deferText?.trim() ? { text: value.deferText } : {}) })}>Request deferral</Button>
      </>}
      {!sourceBacked && <>
        <Button className={s.back} disabled={disabled} onClick={() => set({ capturing: !value.capturing })}>Save as idea</Button>
        {value.capturing && <>
          <Notice title="Capture only the intent you choose">
            This asks brainstorm to save your text for later through this unfiled request. It does not answer the question,
            grant permission, or authorize definition or execution.
          </Notice>
          <Field label="Intent to retain"><Textarea value={value.captureText || ''} className={s.control} rows={5}
            onChange={(_, input) => set({ captureText: input.value })} disabled={disabled} /></Field>
          <Button className={s.back} disabled={disabled || Boolean(captureAttempt && !captureAttempt.retryable)} onClick={() => {
            if (requireText(value.captureText)) void data.capture(value.captureText, 'capture_only', record);
          }}>Capture this intent</Button>
        </>}
      </>}
    </section>}
    {(captureAttempt || captured) && <ResponseStatus record={captured} attempt={captureAttempt} capture />}
  </div>;
}

export function NeedsYou({ data, selected, onSelect, drafts, onDraft, onReview, reviewedKey, onNew, scopeTitle, browsingLabel, onReturn }) {
  const s = useCanvasStyles(), heading = useId();
  const feed = data.needs;
  const records = feed?.requests || [];
  const record = records.find(item => requestKey(feed, item) === selected);
  const pending = records.filter(item => item.phase === 'pending');
  const unavailable = !feed || data.issues.needs || feed.coverage.state === 'unavailable';
  const uncertain = unavailable || feed.coverage.state !== 'current';
  if (record) {
    const request = record.request, key = requestKey(feed, record);
    return <div className={s.measure}>
      {onReturn && <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onReturn}>Back to pack request</Button>}
      <Button className={s.back} icon={<ArrowLeftRegular />} onClick={() => onSelect(null)}>All requests</Button>
      <header className={s.detailHeader}>
        <div className={s.row}><Badge appearance="tint">{CLASSES[request.class]}</Badge>
          <Text className={s.eyebrow}>{request.blocking ? 'Blocking clarification in this context' : 'Advisory request'}</Text></div>
        <h1 className={s.title}>Needs you</h1>
        <p className={request.class === 'permission' ? s.prose : s.lead}>{request.prompt}</p>
      </header>
      <section className={s.scope} aria-label="Request scope">
        <Text className={s.eyebrow}>This request is about</Text>
        <ScopeIdentity scope={request.scope} title={scopeTitle} browsingLabel={browsingLabel} />
        <Text>Owner: {request.owner}</Text>
        <Text className={s.code}>Request: {request.requestRef} · Revision: {request.revision}</Text>
        <Text className={s.code}>Source: {request.source.kind === 'file' ? request.source.path : request.source.kind}{'\n'}{request.source.revision}</Text>
      </section>
      <section className={s.scope}><Text weight="semibold">Why your input is needed</Text>
        <p className={s.prose}>{request.whyHuman}</p><Text weight="semibold">What this unblocks</Text>
        <p className={s.prose}>{request.unblocks}</p></section>
      {unavailable && <Notice intent="warning" title="Current request coverage unavailable">
        {data.issues.needs || feed.coverage.reason || 'The joined owner is unavailable. Your input is retained.'}
      </Notice>}
      <RequestForm key={key} record={record} data={data} value={drafts[key] || {}} onChange={value => onDraft(key, value)}
        onReview={() => onReview(record)} reviewed={reviewedKey === key} />
      {pending.some(item => item.requestHandle !== record.requestHandle) && <section className={s.stack}>
        <h2 className={s.subheading}>Other current requests</h2>
        {pending.filter(item => item.requestHandle !== record.requestHandle).map(item => <Button key={item.requestHandle}
          className={s.requestOption} onClick={() => onSelect(requestKey(feed, item))}>{item.request.prompt}</Button>)}
      </section>}
    </div>;
  }
  const past = records.filter(item => item.phase !== 'pending');
  return <div className={s.measure}>
    {onReturn && <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onReturn}>Back to pack request</Button>}
    <h1 className={s.title} id={heading}>Needs you</h1>
    {uncertain && <Notice intent="warning" title={unavailable ? 'Current request coverage unavailable' : 'Some request coverage is unavailable'}>
      {data.issues.needs || feed?.coverage.reason || 'Affected contexts cannot establish whether further input is needed.'}
      {' '}Recorded work remains available in Overview.
    </Notice>}
    {selected && !record && <Notice title="The previous request is no longer current" intent="warning">
      A changed provider or session cannot restore that invocation. Nothing has been resent.
    </Notice>}
    {pending.length ? <section className={s.stack} aria-labelledby={heading}>
      <p className={s.prose}>Choose the request you want to answer. Other contexts remain available.</p>
      {pending.map(item => <Button key={item.requestHandle} className={s.requestOption}
        onClick={() => onSelect(requestKey(feed, item))}>
        <span className={s.tight}><Text weight="semibold">{item.request.prompt}</Text>
          <Text className={s.eyebrow}>{CLASSES[item.request.class]} · {item.request.owner} · {scopeLabel(item.request.scope)}</Text></span>
      </Button>)}
    </section> : <section className={s.stack}>
      <h2 className={s.subheading}>{uncertain ? 'No current requests can be confirmed' : 'No current requests from the joined owner'}</h2>
      <p className={s.prose}>{uncertain ? 'Missing coverage is not an empty inbox.'
        : 'No admitted request is waiting in this provider. Captured ideas and source-backed dispositions remain in Overview.'}</p>
      <Button className={s.back} onClick={onNew}>New idea</Button>
    </section>}
    {!!past.length && <section className={s.stack} aria-label="Request receipts">
      <h2 className={s.subheading}>Request receipts</h2>
      {past.map(item => <Button key={item.requestHandle} className={s.requestOption}
        onClick={() => onSelect(requestKey(feed, item))}>
        <span className={s.tight}><Text>{item.request.prompt}</Text>
          <Text className={s.eyebrow}>{PHASES[responsePhase(item, item.phase)] || item.phase} · {item.request.owner}</Text></span>
      </Button>)}
    </section>}
  </div>;
}
