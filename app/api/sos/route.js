import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function POST(req) {
  try {
    const { patientName, bloodGroup, lat, lng, caregiverPhone } = await req.json();

    if (!caregiverPhone || typeof caregiverPhone !== "string") {
      return Response.json(
        { success: false, error: "Caregiver phone number is required." },
        { status: 400 }
      );
    }

    // Ensure phone number has leading + and proper format
    const cleanPhone = caregiverPhone.trim().startsWith("+") 
      ? caregiverPhone.trim() 
      : `+${caregiverPhone.trim()}`;

    let callStatus = "pending";
    let callSid = null;
    let smsStatus = "skipped";
    let smsSid = null;
    let callError = null;
    let smsError = null;

    // STEP 1: EXECUTE REAL VOICE CALL FIRST (Highest Priority)
    try {
      const call = await client.calls.create({
        to: cleanPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        twiml: `<Response><Say voice="alice">It's emergency please come as soon as possible. Your contact has triggered an emergency alert. Please check your messages for coordinates immediately.</Say></Response>`,
      });
      callSid = call.sid;
      callStatus = "success";
    } catch (err) {
      console.error("Twilio Voice Call Error:", err.message);
      callError = err.message;
      callStatus = "failed";
    }

    // STEP 2: ATTEMPT SMS IN ISOLATED BLOCK (Do not throw if DLT/template fails)
    try {
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
      const sms = await client.messages.create({
        to: cleanPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: `EMERGENCY ALERT: It's emergency please come as soon as possible! Patient: ${patientName || 'Patient'} (Blood: ${bloodGroup || 'N/A'}). Location: ${mapsUrl}`,
      });
      smsSid = sms.sid;
      smsStatus = "success";
    } catch (err) {
      console.warn("Twilio SMS Template Restriction Warning:", err.message);
      smsError = err.message;
      smsStatus = "failed";
    }

    // Return overall state without crashing
    return Response.json({
      success: callStatus === "success" || smsStatus === "success",
      message: "Emergency alert sent successfully",
      callStatus,
      callSid,
      callError,
      smsStatus,
      smsSid,
      smsError,
      mapsUrl: `https://maps.google.com/?q=${lat},${lng}`
    });
  } catch (globalErr) {
    console.error("Global SOS Handler Error:", globalErr);
    return Response.json({ success: false, error: globalErr.message }, { status: 500 });
  }
}
