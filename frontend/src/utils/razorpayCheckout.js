import api, { getErrorMessage } from "../api/client";

let scriptPromise = null;

function loadRazorpaySdk() {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(true);
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Initiates official Razorpay Checkout for a booking using server-computed order totals.
 * Never marks a booking PAID client-side; always sends Razorpay signature to /api/payments/verify.
 */
export async function launchRazorpayCheckout({
  bookingType,
  bookingId,
  prefill = {},
  onVerified,
  onError,
}) {
  try {
    const orderRes = await api.post("/payments/orders", { bookingType, bookingId });
    const checkout = orderRes.data?.data?.checkout;
    if (!checkout?.orderId || !checkout?.keyId) {
      throw new Error("Server returned an incomplete Razorpay checkout payload.");
    }

    const loaded = await loadRazorpaySdk();
    if (!loaded || !window.Razorpay) {
      throw new Error("Unable to load Razorpay Checkout SDK. Check your network connection.");
    }

    const options = {
      key: checkout.keyId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name || "Travelogia",
      description: checkout.description || `Reservation ${checkout.bookingReference}`,
      order_id: checkout.orderId,
      prefill: {
        name: prefill.name || "",
        email: prefill.email || "",
      },
      theme: { color: "#2563eb" },
      handler: async (response) => {
        try {
          const verifyRes = await api.post("/payments/verify", {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (typeof onVerified === "function") {
            onVerified(verifyRes.data?.data);
          }
        } catch (err) {
          if (typeof onError === "function") {
            onError(getErrorMessage(err, "Server-side payment verification failed."));
          }
        }
      },
      modal: {
        ondismiss: () => {
          if (typeof onError === "function") {
            onError("Payment checkout was dismissed before completion. Booking remains unpaid.");
          }
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (err) {
    if (typeof onError === "function") {
      onError(getErrorMessage(err, "Unable to initiate Razorpay payment."));
    }
  }
}
