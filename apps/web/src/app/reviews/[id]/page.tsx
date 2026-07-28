"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  CircleDashed,
  ExternalLink,
  Lightbulb,
  LoaderCircle,
  SearchCheck,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { apiError } from "@/lib/errors";
import { clearPendingReview } from "@/lib/pending-review";
import type { StoredReview } from "@/lib/types";

type ReviewResponse = {
  status: string;
  review?: StoredReview;
  transaction?: { status?: string; executionResult?: string };
};

function ReviewContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const reviewId = decodeURIComponent(params.id);
  const transactionHash = search.get("transactionHash") || "";
  const [data, setData] = useState<ReviewResponse>({ status: "pending" });
  const [error, setError] = useState("");
  const [settlement, setSettlement] = useState("");
  const settlementStarted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const query = transactionHash ? `?transactionHash=${encodeURIComponent(transactionHash)}` : "";
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}${query}`, { cache: "no-store" });
      const result = (await response.json()) as ReviewResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to read review.");
      if (result.review) {
        clearPendingReview(
          result.review.review_kind,
          Number(result.review.event_id),
          Number(result.review.milestone_id),
        );
      }
      setData(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read review.");
    }
  }, [reviewId, transactionHash]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    if (data.review) return;
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh, data.review]);

  useEffect(() => {
    const review = data.review;
    if (
      !review ||
      review.review_kind !== "initial" ||
      review.result.decision !== "approved" ||
      settlementStarted.current
    ) {
      return;
    }
    settlementStarted.current = true;
    setSettlement("Releasing verified payout through hosted 1Shot");
    void fetch(`/api/reviews/${encodeURIComponent(review.review_id)}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "automatic-payout",
        eventId: Number(review.event_id),
        milestoneId: Number(review.milestone_id),
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await apiError(response, "Automatic payout failed."));
        }
        setSettlement("Payout confirmed on Base Sepolia");
      })
      .catch((caught) => {
        setSettlement("");
        setError(caught instanceof Error ? caught.message : "Automatic payout failed.");
        settlementStarted.current = false;
      });
  }, [data.review]);

  if (!data.review) {
    return (
      <>
        <Link href="/app" className="back-link"><ArrowLeft size={16} />Workspace</Link>
        <div className="review-wait">
          <div className="consensus-orbit"><CircleDashed /><span /><span /></div>
          <p className="eyebrow">GenLayer StudioNet</p>
          <h1>Comparative consensus in progress</h1>
          <p>Validators are independently reviewing the milestone evidence and comparing the decision, score, findings, and citations.</p>
          <div className="review-id">{reviewId}</div>
          <div className="status-line"><LoaderCircle className="spin" size={16} />{data.transaction?.executionResult || data.transaction?.status || data.status}</div>
          {error && <div className="form-error">{error}</div>}
        </div>
      </>
    );
  }

  const review = data.review;
  const result = review.result;
  return (
    <>
      <Link href={`/events/${review.event_id}`} className="back-link"><ArrowLeft size={16} />Event #{review.event_id}</Link>
      <div className="verdict-header">
        <div><p className="eyebrow">Comparative consensus verdict</p><h1>{result.decision}</h1><p>{result.explanation}</p></div>
        <div className={`score-dial ${result.decision}`}><strong>{result.score}</strong><span>/ 100</span></div>
      </div>
      <section className="verdict-flags">
        <span className={result.criterion_met ? "pass" : "fail"}>{result.criterion_met ? <CheckCircle2 /> : <AlertTriangle />}Criterion met</span>
        <span className={result.measurement_valid ? "pass" : "fail"}>{result.measurement_valid ? <CheckCircle2 /> : <AlertTriangle />}Measurement valid</span>
        <span className={!result.material_exception ? "pass" : "fail"}>{!result.material_exception ? <CheckCircle2 /> : <AlertTriangle />}No material exception</span>
      </section>
      {result.decision === "approved" && (
        <section className="automatic-payout-status">
          {settlement === "Payout confirmed on Base Sepolia" ? (
            <CheckCircle2 size={19} />
          ) : (
            <LoaderCircle className="spin" size={19} />
          )}
          <div>
            <strong>{settlement || "Preparing automatic payout"}</strong>
            <p>Passing reviews are settled automatically when the score meets the funded minimum.</p>
          </div>
          <CircleDollarSign size={22} />
        </section>
      )}
      {error && <div className="form-error">{error}</div>}
      <section className="verdict-grid">
        <article className="verdict-review"><div className="panel-title"><SearchCheck />Evidence review</div><p>{result.review}</p></article>
        <VerdictList icon={<TrendingUp />} title="Strengths" items={result.strengths} />
        <VerdictList icon={<AlertTriangle />} title="Improvements" items={result.improvements} />
        <VerdictList icon={<Lightbulb />} title="Suggested next steps" items={result.suggestions} />
        <VerdictList icon={<SearchCheck />} title="Evidence gaps" items={result.evidence_gaps} />
        <article className="verdict-panel">
          <div className="panel-title"><ExternalLink />Citations</div>
          {result.citations.length ? result.citations.map((citation) => (
            <a key={citation} href={citation.startsWith("http") ? citation : undefined} target="_blank" rel="noreferrer">{citation}<ExternalLink size={13} /></a>
          )) : <p>No citations returned.</p>}
        </article>
      </section>
    </>
  );
}

function VerdictList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return <article className="verdict-panel"><div className="panel-title">{icon}{title}</div>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None identified.</p>}</article>;
}

export default function ReviewPage() {
  return <Suspense fallback={<div className="loading-state"><LoaderCircle className="spin" />Loading review</div>}><ReviewContent /></Suspense>;
}
