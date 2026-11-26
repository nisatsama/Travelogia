import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";

const DOC_CATEGORIES = [
  "ALL",
  "HOTEL_CONFIRMATION",
  "FLIGHT_REF",
  "TRAIN_REF",
  "BUS_TICKET",
  "ACTIVITY_BOOKING",
  "PAYMENT_RECEIPT",
  "TRAVEL_DOCUMENT",
];

export default function TravelWallet() {
  const { user } = useAuth();
  const [tab, setTab] = useState("wallet");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [docs, setDocs] = useState([]);
  const [insurance, setInsurance] = useState({ data: [], disclosure: "" });
  const [regionFilter, setRegionFilter] = useState("");
  const [qrModal, setQrModal] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  // Upload draft
  const [draft, setDraft] = useState({
    title: "",
    category: "TRAVEL_DOCUMENT",
    referenceCode: "",
    referenceOrigin: "user-uploaded",
    providerName: "",
    eventDate: "",
    notes: "",
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const insRes = await api.get("/insurance/providers", {
          params: regionFilter ? { region: regionFilter } : {},
        });
        if (active) {
          setInsurance({
            data: insRes.data?.data || [],
            disclosure: insRes.data?.disclosure || "",
          });
        }
      } catch {
        // non-blocking
      }
    })();
    return () => {
      active = false;
    };
  }, [regionFilter]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get("/wallet", {
          params: categoryFilter !== "ALL" ? { category: categoryFilter } : {},
        });
        if (active) setDocs(res.data?.data || []);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Unable to load Digital Travel Wallet."));
      }
    })();
    return () => {
      active = false;
    };
  }, [user, categoryFilter, reloadNonce]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!user) return setError("Please sign in to store travel documents.");
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      Object.entries(draft).forEach(([k, v]) => formData.append(k, v));
      if (file) formData.append("file", file);

      await api.post("/wallet", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Document stored securely in your private Travel Wallet.");
      setDraft({
        title: "",
        category: "TRAVEL_DOCUMENT",
        referenceCode: "",
        referenceOrigin: "user-uploaded",
        providerName: "",
        eventDate: "",
        notes: "",
      });
      setFile(null);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Document upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateQr = async (docId) => {
    setError("");
    try {
      const res = await api.get(`/wallet/${docId}/qr`);
      setQrModal(res.data?.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "QR code could not be generated for this entry."));
    }
  };

  const handleDeleteDoc = async (docId) => {
    setError("");
    setNotice("");
    try {
      await api.delete(`/wallet/${docId}`);
      setNotice("Document removed from your Travel Wallet.");
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete document."));
    }
  };

  const handleSecureDownload = async (doc) => {
    setError("");
    try {
      const res = await api.get(`/wallet/${doc._id}/file`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = doc.fileOriginalName || `${doc.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to download document."));
    }
  };

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🪪 Digital Travel Wallet &amp; Insurance Discovery</h1>
          <p>
            Store hotel confirmations, flight &amp; train PNRs, bus tickets, activity vouchers,
            payment receipts, and private travel documents securely — plus discover authorized
            travel insurance providers via official external quotation portals.
          </p>
        </div>

        <div className="v2-tabs">
          <button
            type="button"
            className={`v2-tab ${tab === "wallet" ? "active" : ""}`}
            onClick={() => setTab("wallet")}
          >
            🪪 Digital Travel Wallet ({docs.length})
          </button>
          <button
            type="button"
            className={`v2-tab ${tab === "insurance" ? "active" : ""}`}
            onClick={() => setTab("insurance")}
          >
            🛡️ Travel Insurance Discovery ({insurance.data.length})
          </button>
        </div>

        {error && <div className="v2-alert-error">{error}</div>}
        {notice && <div className="v2-alert-success">{notice}</div>}

        {/* MODULE 27: DIGITAL TRAVEL WALLET */}
        {tab === "wallet" && (
          <>
            {!user ? (
              <div className="v2-card">
                <p>
                  Please <Link to="/login">sign in</Link> to access your private Digital Travel
                  Wallet.
                </p>
              </div>
            ) : (
              <div className="v2-grid-sidebar">
                <form onSubmit={handleUpload} className="v2-card">
                  <div className="v2-card-title">Add / Upload Document</div>
                  <div className="v2-field">
                    <label>Title</label>
                    <input
                      required
                      className="v2-input"
                      placeholder="e.g. Passport Copy, Schengen Visa, Hotel Voucher"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Category</label>
                    <select
                      className="v2-select"
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    >
                      {DOC_CATEGORIES.filter((c) => c !== "ALL").map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Reference / PNR (Optional)</label>
                    <input
                      className="v2-input"
                      placeholder="Provider confirmation code or PNR"
                      value={draft.referenceCode}
                      onChange={(e) => setDraft({ ...draft, referenceCode: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Reference Source</label>
                    <select
                      className="v2-select"
                      value={draft.referenceOrigin}
                      onChange={(e) => setDraft({ ...draft, referenceOrigin: e.target.value })}
                    >
                      <option value="user-uploaded">Personal Document (no QR)</option>
                      <option value="provider-issued">Provider-Issued PNR / Ref (QR eligible)</option>
                    </select>
                  </div>
                  <div className="v2-field">
                    <label>Provider / Issuer</label>
                    <input
                      className="v2-input"
                      placeholder="Airline, Hotel, Embassy..."
                      value={draft.providerName}
                      onChange={(e) => setDraft({ ...draft, providerName: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Event / Expiry Date</label>
                    <input
                      type="date"
                      className="v2-input"
                      value={draft.eventDate}
                      onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Upload File (PDF, JPEG, PNG, WEBP · max 5 MB)</label>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="v2-field">
                    <label>Notes</label>
                    <textarea
                      rows={2}
                      className="v2-textarea"
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="v2-btn v2-btn-primary" disabled={uploading}>
                    {uploading ? "Uploading..." : "Save to Private Wallet"}
                  </button>
                </form>

                <div>
                  <div className="v2-card" style={{ marginBottom: "14px" }}>
                    <div className="v2-chip-row">
                      {DOC_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`v2-btn v2-btn-sm ${
                            categoryFilter === cat ? "v2-btn-primary" : "v2-btn-secondary"
                          }`}
                          onClick={() => setCategoryFilter(cat)}
                        >
                          {cat.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {qrModal && (
                    <div
                      className="v2-card"
                      style={{ marginBottom: "16px", borderColor: "#2563eb", textAlign: "center" }}
                    >
                      <div className="v2-card-title">
                        <span>Reference Lookup QR — {qrModal.referenceCode}</span>
                        <button
                          type="button"
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          onClick={() => setQrModal(null)}
                        >
                          Close
                        </button>
                      </div>
                      <img
                        src={qrModal.qrDataUrl}
                        alt={`QR for ${qrModal.referenceCode}`}
                        style={{ width: "200px", height: "200px", margin: "8px auto" }}
                      />
                      <div className="v2-disclaimer" style={{ textAlign: "left" }}>
                        <strong>Important Disclosure:</strong> {qrModal.disclosure}
                      </div>
                    </div>
                  )}

                  {docs.length === 0 ? (
                    <div className="v2-card">
                      Your Digital Travel Wallet is empty. Book a stay, bus, or activity, or upload
                      your personal travel documents on the left.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "12px" }}>
                      {docs.map((d) => {
                        const qrEligible =
                          Boolean(d.referenceCode) &&
                          (d.referenceOrigin === "internal-booking" ||
                            d.referenceOrigin === "provider-issued");
                        return (
                          <div key={d._id} className="v2-card">
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <span className="v2-chip">{d.category.replace(/_/g, " ")}</span>{" "}
                                <strong>{d.title}</strong>
                              </div>
                              {d.eventDate && (
                                <span style={{ fontSize: "13px", color: "#64748b" }}>
                                  {d.eventDate}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "13px", color: "#475569", marginTop: "6px" }}>
                              {d.providerName && <span>Provider: {d.providerName} · </span>}
                              {d.referenceCode && (
                                <span>
                                  Ref: <strong>{d.referenceCode}</strong>
                                </span>
                              )}
                            </div>
                            {d.notes && (
                              <div style={{ fontSize: "13px", color: "#334155", marginTop: "6px" }}>
                                {d.notes}
                              </div>
                            )}
                            <div className="v2-chip-row" style={{ marginTop: "10px" }}>
                              {d.fileStoredName && (
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-primary v2-btn-sm"
                                  onClick={() => handleSecureDownload(d)}
                                >
                                  Download Private File ({d.fileOriginalName || "file"})
                                </button>
                              )}
                              {qrEligible && (
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-secondary v2-btn-sm"
                                  onClick={() => handleGenerateQr(d._id)}
                                >
                                  Show Reference QR
                                </button>
                              )}
                              <button
                                type="button"
                                className="v2-btn v2-btn-danger v2-btn-sm"
                                onClick={() => handleDeleteDoc(d._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* MODULE 29: TRAVEL INSURANCE DISCOVERY */}
        {tab === "insurance" && (
          <div>
            <div className="v2-card" style={{ marginBottom: "18px" }}>
              <div className="v2-field" style={{ maxWidth: "360px", marginBottom: 0 }}>
                <label>Filter by Region Focus</label>
                <input
                  className="v2-input"
                  placeholder="India, International, Global..."
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                />
              </div>
              {insurance.disclosure && <div className="v2-disclaimer">{insurance.disclosure}</div>}
            </div>

            <div className="v2-grid-2">
              {insurance.data.map((p) => (
                <div key={p.id} className="v2-card">
                  <div className="v2-card-title">
                    <span>{p.providerName}</span>
                    <span className="v2-chip v2-chip-unknown">{p.sourceLabel}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#475569", marginBottom: "8px" }}>
                    <strong>Region:</strong> {p.regionFocus} · <strong>Regulator:</strong>{" "}
                    {p.regulator}
                  </div>
                  <ul
                    style={{
                      paddingLeft: "18px",
                      fontSize: "13.5px",
                      color: "#334155",
                      lineHeight: 1.6,
                      marginBottom: "14px",
                    }}
                  >
                    {(p.commonCoverageCategories || []).map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                  <a
                    href={p.officialQuoteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="v2-btn v2-btn-accent v2-btn-sm"
                  >
                    Get Official Quote on Insurer Portal ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
