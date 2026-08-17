-- Superseded by Twilio Verify (which owns code generation, expiry, and
-- attempt-limiting itself) before phone_otp_codes was ever used in
-- production -- the custom-OTP approach from 0021 didn't work on a Twilio
-- trial account (trial SMS is restricted to predefined templates, which
-- can't embed a dynamic code), so phone/send-otp and phone/verify-otp were
-- switched to call Twilio's Verify API instead. profiles.phone_verified,
-- the unique index, and the protect_phone_verified trigger are unaffected.
drop table if exists public.phone_otp_codes;
