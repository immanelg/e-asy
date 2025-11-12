package main

import (
	"database/sql"
	"os"
	// _ "github.com/mattn/go-sqlite3"
	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB() {
	databasePath := os.Getenv("DATABASE_PATH")
	const devDatabasePath = "./_dev_db"
	if databasePath == "" {
		databasePath = devDatabasePath
		slogger.Warn("no DATABASE_PATH in env, using the default one: " + databasePath)
	}

	var err error
	db, err = sql.Open("sqlite", databasePath)
	if err != nil {
		panic(err)
	}

	// healthcheck
	_, errExec := db.Exec(`select 1;`)
	if errExec != nil {
		panic(errExec)
	}
}

func closeDB() {
	if db != nil {
		db.Close()
	}
}
