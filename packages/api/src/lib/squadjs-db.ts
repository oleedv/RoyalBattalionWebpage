import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getSquadJSPool(): mysql.Pool {
  if (!pool) {
    const url = process.env.SQUADJS_DATABASE_URL;
    if (!url) throw new Error("SQUADJS_DATABASE_URL is not configured");
    pool = mysql.createPool(url);
  }
  return pool;
}
