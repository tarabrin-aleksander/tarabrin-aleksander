package main

import (
	"io/ioutil"
	"log"
	"os"
)

func main() {
	directory := "./pages/"
	files, err := ioutil.ReadDir(directory)
	if err != nil {
		log.Fatal(err)
	}
	header, err := ioutil.ReadFile("./pages/parts/header.html")
	if err != nil {
		log.Fatalf("openning template - %v\r\n", err)
	}
	footer, err := ioutil.ReadFile("./pages/parts/footer.html")
	if err != nil {
		log.Fatalf("openning template - %v\r\n", err)
	}
	for _, f := range files {
		// name := strings.TrimSuffix(f.Name(), filepath.Ext(f.Name()))
		if IsDirectory(directory + f.Name()) {
			continue
		}
		content, err := ioutil.ReadFile(directory + f.Name())
		if err != nil {
			log.Fatalf("openning content - %v\r\n", err)
		}

		configPath := "./" + f.Name()
		local1, err := os.Create(configPath) // For read access.
		if err != nil {
			log.Fatalf("openning local1 - %v\r\n", err)
		}
		local1.Write(header)
		local1.Write(content)
		local1.Write(footer)
		local1.Close()
	}
}

func IsDirectory(path string) bool {
	fileInfo, err := os.Stat(path)
	if err != nil {
		return false
	}
	return fileInfo.IsDir()
}
