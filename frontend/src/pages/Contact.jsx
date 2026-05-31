import React from "react";

const Contact = () => {
  const styles = {
    page: {
      minHeight: "100vh",
      padding: "100px 8%",
      background: "linear-gradient(135deg, #8ab9f6, #163674, #ffffff)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    },

    container: {
      width: "100%",
      maxWidth: "1200px",
      background: "#ace2eb",
      borderRadius: "30px",
      padding: "50px",
      boxShadow: "0 20px 50px rgba(0,0,0,0.08)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "40px",
    },

    left: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    },

    heading: {
      fontSize: "3rem",
      fontWeight: "800",
      color: "#1f2937",
      marginBottom: "15px",
    },

    subtext: {
      color: "#6b7280",
      fontSize: "1.05rem",
      lineHeight: "1.8",
      marginBottom: "30px",
    },

    infoCard: {
      background: "#fbfcfd",
      padding: "18px 22px",
      borderRadius: "15px",
      marginBottom: "15px",
      borderLeft: "5px solid #4f46e5",
    },

    label: {
      fontWeight: "700",
      color: "#4f46e5",
      marginBottom: "5px",
    },

    value: {
      color: "#374151",
      fontSize: "1rem",
    },

    right: {
      background: "linear-gradient(135deg, #0a0129, #6fe3f7)",
      borderRadius: "25px",
      padding: "40px",
      color: "white",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    },

    socialTitle: {
      fontSize: "2rem",
      fontWeight: "700",
      marginBottom: "20px",
    },

    socialItem: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "18px",
      fontSize: "1.1rem",
    },

    footerText: {
      marginTop: "25px",
      lineHeight: "1.8",
      opacity: "0.9",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Left Section */}
        <div style={styles.left}>
          <h1 style={styles.heading}>Contact Travelogia</h1>

          <p style={styles.subtext}>
            Have questions about your next adventure? Our travel experts are
            here to help you plan unforgettable experiences around the globe.
          </p>

          <div style={styles.infoCard}>
            <div style={styles.label}>📧 Email</div>
            <div style={styles.value}>support@travelogia.com</div>
          </div>

          <div style={styles.infoCard}>
            <div style={styles.label}>📞 Phone</div>
            <div style={styles.value}>+91 98765 43210</div>
          </div>

          <div style={styles.infoCard}>
            <div style={styles.label}>📍 Address</div>
            <div style={styles.value}>
              Travelogia Headquarters,
              <br />
              Bandra Kurla Complex,
              <br />
              Mumbai, Maharashtra 400051, India
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div style={styles.right}>
          <h2 style={styles.socialTitle}>Connect With Us 🌍</h2>

          <div style={styles.socialItem}>
            📸 Instagram: @travelogia_official
          </div>

          <div style={styles.socialItem}>👍 Facebook: Travelogia Official</div>

          <div style={styles.socialItem}>🐦 X (Twitter): @TravelogiaTrips</div>

          <div style={styles.socialItem}>
            💼 LinkedIn: Travelogia Travel Services
          </div>

          <div style={styles.socialItem}>▶️ YouTube: Travelogia Adventures</div>

          <div style={styles.socialItem}>
            📌 Pinterest: Travelogia Destinations
          </div>

          <p style={styles.footerText}>
            Follow us for travel inspiration, destination guides, exclusive
            offers, and unforgettable experiences from around the world.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Contact;
