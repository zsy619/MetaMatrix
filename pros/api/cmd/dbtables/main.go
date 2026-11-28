package main

import (
	"encoding/json"
	"fmt"
	"os"

	"metamatrix/api/internal/model"
)

type catalog struct {
	Domains []string         `json:"domains"`
	Tables  []model.TableEntry `json:"tables"`
}

func main() {
	out := catalog{Domains: model.TableDomains, Tables: model.TableRegistry}
	raw, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(raw))
}
