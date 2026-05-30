const { Store } = require("express-session");
const supabase = require("../config/database");

class SupabaseSessionStore extends Store {
  async get(sid, cb) {
    try {
      const { data } = await supabase
        .from("sessions")
        .select("sess, expire")
        .eq("sid", sid)
        .single();
      if (!data) return cb(null, null);
      if (new Date(data.expire) < new Date()) {
        await supabase.from("sessions").delete().eq("sid", sid);
        return cb(null, null);
      }
      cb(null, data.sess);
    } catch (e) {
      cb(null, null);
    }
  }

  async set(sid, sess, cb) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await supabase.from("sessions").upsert({
        sid,
        sess,
        expire: expire.toISOString(),
      });
      cb(null);
    } catch (e) {
      cb(null);
    }
  }

  async destroy(sid, cb) {
    try {
      await supabase.from("sessions").delete().eq("sid", sid);
      cb(null);
    } catch (e) {
      cb(null);
    }
  }
}

module.exports = SupabaseSessionStore;