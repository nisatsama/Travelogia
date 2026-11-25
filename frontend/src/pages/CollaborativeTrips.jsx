import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import api, { getAuthToken, getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import V2NavBar from "../components/V2NavBar";
import RouteMap from "../components/RouteMap";

export default function CollaborativeTrips() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [onlineMembers, setOnlineMembers] = useState([]);
  const [allDestinations, setAllDestinations] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [selectedDestId, setSelectedDestId] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDay, setActivityDay] = useState(1);
  const [activityAssignee, setActivityAssignee] = useState("");
  const [commentText, setCommentText] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dRes = await api.get("/travels", { params: { limit: 100 } });
        if (active) setAllDestinations(dRes.data?.data || []);
      } catch {
        // ignore
      }
      if (!user) return;
      try {
        const tRes = await api.get("/trips");
        if (!active) return;
        const list = tRes.data?.data || [];
        setTrips(list);
        if (list.length > 0) setActiveTrip((prev) => prev || list[0]);
      } catch (err) {
        if (active) setError(getErrorMessage(err, "Could not load collaborative trips."));
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Connect authenticated Socket.IO client & join active private trip room
  useEffect(() => {
    if (!user || !activeTrip?._id) return;
    const token = getAuthToken();
    const socket = io(window.location.origin, {
      withCredentials: true,
      auth: token ? { token } : undefined,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const tripId = activeTrip._id;
    socket.on("connect", () => {
      socket.emit("trip:join", tripId, (ack) => {
        if (ack?.ok && Array.isArray(ack.onlineMembers)) {
          setOnlineMembers(ack.onlineMembers);
        }
      });
    });

    socket.on("trip:presence", (payload) => {
      if (payload?.tripId === tripId) {
        setOnlineMembers(payload.onlineMembers || []);
      }
    });

    socket.on("trip:updated", (updatedTrip) => {
      if (updatedTrip?._id === tripId) {
        setActiveTrip(updatedTrip);
        setTrips((prev) => prev.map((t) => (t._id === tripId ? updatedTrip : t)));
      }
    });

    return () => {
      socket.emit("trip:leave", tripId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, activeTrip?._id]);

  const applyTripResponse = (updated) => {
    if (!updated) return;
    setActiveTrip(updated);
    setTrips((prev) => {
      const exists = prev.some((t) => t._id === updated._id);
      return exists ? prev.map((t) => (t._id === updated._id ? updated : t)) : [updated, ...prev];
    });
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/trips", { title: newTitle });
      applyTripResponse(res.data?.data);
      setNewTitle("");
      setSuccess("Created private collaborative workspace! Share the invite code with friends.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not create trip."));
    }
  };

  const handleJoinTrip = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/trips/join", { inviteCode: inviteCodeInput });
      applyTripResponse(res.data?.data);
      setInviteCodeInput("");
      setSuccess("Joined collaborative trip!");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid invite code."));
    }
  };

  const handleAddDest = async () => {
    if (!activeTrip?._id || !selectedDestId) return;
    setError("");
    try {
      const res = await api.post(`/trips/${activeTrip._id}/destinations`, {
        travelId: selectedDestId,
      });
      applyTripResponse(res.data?.data);
      setSelectedDestId("");
    } catch (err) {
      setError(getErrorMessage(err, "Could not add destination."));
    }
  };

  const handleVoteDest = async (travelId) => {
    try {
      const res = await api.post(`/trips/${activeTrip._id}/destinations/${travelId}/vote`);
      applyTripResponse(res.data?.data);
    } catch (err) {
      setError(getErrorMessage(err, "Could not toggle vote."));
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!activityTitle.trim()) return;
    setError("");
    try {
      const res = await api.post(`/trips/${activeTrip._id}/activities`, {
        title: activityTitle,
        dayNumber: Number(activityDay) || 1,
        assignedTo: activityAssignee,
      });
      applyTripResponse(res.data?.data);
      setActivityTitle("");
      setActivityAssignee("");
    } catch (err) {
      setError(getErrorMessage(err, "Could not add activity."));
    }
  };

  const handleToggleActivityStatus = async (act) => {
    const nextStatus = act.status === "planned" ? "booked" : act.status === "booked" ? "done" : "planned";
    try {
      const res = await api.patch(`/trips/${activeTrip._id}/activities/${act.id}`, {
        status: nextStatus,
      });
      applyTripResponse(res.data?.data);
    } catch (err) {
      setError(getErrorMessage(err, "Could not update activity status."));
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const res = await api.post(`/trips/${activeTrip._id}/comments`, { text: commentText });
      applyTripResponse(res.data?.data);
      setCommentText("");
    } catch (err) {
      setError(getErrorMessage(err, "Could not post comment."));
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseTitle.trim() || !expenseAmount) return;
    try {
      const res = await api.post(`/trips/${activeTrip._id}/expenses`, {
        title: expenseTitle,
        amount: Number(expenseAmount),
      });
      applyTripResponse(res.data?.data);
      setExpenseTitle("");
      setExpenseAmount("");
    } catch (err) {
      setError(getErrorMessage(err, "Could not add shared expense."));
    }
  };

  const handleRoleChange = async (memberUserId, nextRole) => {
    try {
      const res = await api.patch(`/trips/${activeTrip._id}/members/${memberUserId}`, {
        role: nextRole,
      });
      applyTripResponse(res.data?.data);
    } catch (err) {
      setError(getErrorMessage(err, "Could not update role."));
    }
  };

  const myMember = (activeTrip?.members || []).find(
    (m) => String(m.user) === String(user?.id || user?._id),
  );
  const canEdit = myMember && (myMember.role === "owner" || myMember.role === "editor");

  return (
    <div className="v2-page">
      <V2NavBar />
      <div className="v2-container">
        <div className="v2-hero-banner">
          <h1>🤝 Collaborative Trip Planning</h1>
          <p>
            Real-time Socket.IO group workspace for private trips: invite friends by code, vote on
            destinations and activities, assign responsibilities, chat in comments, and split expenses.
          </p>
        </div>

        {!user && (
          <div className="v2-alert-error">
            Sign in to create or join a private collaborative trip workspace.{" "}
            <Link to="/login" style={{ fontWeight: 700, color: "#991b1b" }}>
              Sign In →
            </Link>
          </div>
        )}
        {error && <div className="v2-alert-error">{error}</div>}
        {success && <div className="v2-alert-success">{success}</div>}

        {user && (
          <div className="v2-grid-sidebar">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <form className="v2-card" onSubmit={handleCreateTrip}>
                <div className="v2-card-title">Start New Group Trip</div>
                <div className="v2-field">
                  <label>Trip Workspace Name</label>
                  <input
                    className="v2-input"
                    placeholder="e.g., Sikkim & Darjeeling Friends Trip"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="v2-btn v2-btn-primary" style={{ width: "100%" }}>
                  + Create Private Trip
                </button>
              </form>

              <form className="v2-card" onSubmit={handleJoinTrip}>
                <div className="v2-card-title">Join via Invite Code</div>
                <div className="v2-field">
                  <label>8-Character Invite Code</label>
                  <input
                    className="v2-input"
                    placeholder="e.g., A1B2C3D4"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <button type="submit" className="v2-btn v2-btn-accent" style={{ width: "100%" }}>
                  Join Workspace
                </button>
              </form>

              <div className="v2-card">
                <div className="v2-card-title">My Trips ({trips.length})</div>
                {trips.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#64748b" }}>
                    No collaborative trips yet. Create one or join using an invite code.
                  </p>
                ) : (
                  trips.map((t) => (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => setActiveTrip(t)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        marginBottom: "8px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        border: activeTrip?._id === t._id ? "2px solid #2563eb" : "1px solid #e2e8f0",
                        background: activeTrip?._id === t._id ? "#eff6ff" : "#f8fafc",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{t.title}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        Code: <strong>{t.inviteCode}</strong> · {(t.members || []).length} member(s)
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {!activeTrip ? (
                <div className="v2-card" style={{ textAlign: "center", padding: "48px 24px" }}>
                  <h2>Select or create a collaborative workspace</h2>
                  <p style={{ color: "#64748b" }}>
                    All updates broadcast live via Socket.IO to every authorized member in the room.
                  </p>
                </div>
              ) : (
                <>
                  <div className="v2-card">
                    <div className="v2-card-title">
                      <span>{activeTrip.title}</span>
                      <span className="v2-chip">Invite Code: {activeTrip.inviteCode}</span>
                    </div>
                    <div className="v2-chip-row" style={{ marginBottom: "12px" }}>
                      <span className="v2-chip v2-chip-yes">
                        ● {Math.max(1, onlineMembers.length)} online now
                      </span>
                      {(activeTrip.members || []).map((m) => (
                        <span key={m.user} className="v2-chip">
                          {m.username} ({m.role})
                          {myMember?.role === "owner" && m.role !== "owner" && (
                            <select
                              style={{ marginLeft: "6px", fontSize: "11px", borderRadius: "6px" }}
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user, e.target.value)}
                            >
                              <option value="editor">editor</option>
                              <option value="viewer">viewer</option>
                            </select>
                          )}
                        </span>
                      ))}
                    </div>

                    {(activeTrip.destinations || []).length > 0 && (
                      <RouteMap stops={activeTrip.destinations} height="260px" />
                    )}
                  </div>

                  {/* Destinations & Voting */}
                  <div className="v2-card">
                    <div className="v2-card-title">Shared Destinations &amp; Voting</div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                        <select
                          className="v2-select"
                          value={selectedDestId}
                          onChange={(e) => setSelectedDestId(e.target.value)}
                        >
                          <option value="">Choose a Travelogia destination...</option>
                          {allDestinations.map((d) => (
                            <option key={d._id} value={d._id}>
                              {d.title} ({d.city}, {d.country})
                            </option>
                          ))}
                        </select>
                        <button type="button" className="v2-btn v2-btn-primary" onClick={handleAddDest}>
                          Add Stop
                        </button>
                      </div>
                    )}

                    {(activeTrip.destinations || []).length === 0 ? (
                      <p style={{ fontSize: "13.5px", color: "#64748b" }}>No destinations added yet.</p>
                    ) : (
                      <div className="v2-grid-2">
                        {activeTrip.destinations.map((d) => (
                          <div key={d.travelId} className="v2-stat-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{d.title}</div>
                              <div style={{ fontSize: "12px", color: "#64748b" }}>
                                {d.city}, {d.country} · Added by {d.addedBy}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="v2-btn v2-btn-secondary v2-btn-sm"
                              onClick={() => handleVoteDest(d.travelId)}
                            >
                              👍 {(d.votes || []).length}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Activities & Responsibilities */}
                  <div className="v2-card">
                    <div className="v2-card-title">Shared Activities &amp; Task Assignments</div>
                    {canEdit && (
                      <form onSubmit={handleAddActivity} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <input
                          className="v2-input"
                          style={{ flex: "2 1 180px" }}
                          placeholder="Activity or booking task..."
                          value={activityTitle}
                          onChange={(e) => setActivityTitle(e.target.value)}
                        />
                        <input
                          type="number"
                          min="1"
                          className="v2-input"
                          style={{ width: "80px" }}
                          value={activityDay}
                          onChange={(e) => setActivityDay(e.target.value)}
                        />
                        <input
                          className="v2-input"
                          style={{ flex: "1 1 130px" }}
                          placeholder="Assign to..."
                          value={activityAssignee}
                          onChange={(e) => setActivityAssignee(e.target.value)}
                        />
                        <button type="submit" className="v2-btn v2-btn-primary v2-btn-sm">
                          + Add
                        </button>
                      </form>
                    )}

                    {(activeTrip.activities || []).map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 10px",
                          borderBottom: "1px solid #e2e8f0",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <strong>Day {a.dayNumber}:</strong> {a.title}{" "}
                          {a.assignedTo && <span className="v2-chip">Owner: {a.assignedTo}</span>}
                        </div>
                        <button
                          type="button"
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          disabled={!canEdit}
                          onClick={() => handleToggleActivityStatus(a)}
                        >
                          Status: {a.status}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Expense Splitter & Comments */}
                  <div className="v2-grid-2">
                    <div className="v2-card">
                      <div className="v2-card-title">
                        <span>Expense Splitter</span>
                        <span className="v2-chip">
                          Total: {activeTrip.currency} {activeTrip.expenseSummary?.totalSpent || 0}
                        </span>
                      </div>
                      {canEdit && (
                        <form onSubmit={handleAddExpense} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                          <input
                            className="v2-input"
                            placeholder="Hotel, cab, dinner..."
                            value={expenseTitle}
                            onChange={(e) => setExpenseTitle(e.target.value)}
                          />
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            className="v2-input"
                            style={{ width: "110px" }}
                            placeholder="Amount"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                          />
                          <button type="submit" className="v2-btn v2-btn-accent v2-btn-sm">
                            Add
                          </button>
                        </form>
                      )}
                      {(activeTrip.expenseSummary?.balances || []).map((b) => (
                        <div key={b.user} style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
                          <strong>{b.username}</strong>: Paid {activeTrip.currency} {b.paid} · Share{" "}
                          {activeTrip.currency} {b.share} · Net:{" "}
                          <strong style={{ color: b.netBalance >= 0 ? "#15803d" : "#b91c1c" }}>
                            {b.netBalance >= 0 ? `+${b.netBalance}` : b.netBalance}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="v2-card">
                      <div className="v2-card-title">Live Discussion</div>
                      <div style={{ maxHeight: "200px", overflowY: "auto", marginBottom: "10px" }}>
                        {(activeTrip.comments || []).length === 0 ? (
                          <p style={{ fontSize: "13px", color: "#64748b" }}>Start the group conversation!</p>
                        ) : (
                          activeTrip.comments.map((c) => (
                            <div key={c.id} style={{ padding: "6px 8px", background: "#f8fafc", borderRadius: "8px", marginBottom: "6px", fontSize: "13px" }}>
                              <strong>{c.username}:</strong> {c.text}
                            </div>
                          ))
                        )}
                      </div>
                      <form onSubmit={handleAddComment} style={{ display: "flex", gap: "8px" }}>
                        <input
                          className="v2-input"
                          placeholder="Write a message..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                        />
                        <button type="submit" className="v2-btn v2-btn-primary v2-btn-sm">
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
