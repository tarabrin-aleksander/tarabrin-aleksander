package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"strings"
)

var (
	directory = flag.String("directory", "", "directory")
	template  = `<a href="%s" class="service left-icon probootstrap-animate">
		<div class="icon"><i class="icon-checkmark"></i></div>
		<div class="text">
		<h3>%s</h3>
		</div>  
	</a>`
	templateWrap = `
		'<div class="col-md-6">
			%s
		</div>
		<div class="col-md-6">
			%s
		</div>'`
)

func main() {
	flag.Parse()
	if directory == nil {
		fmt.Errorf("directory is empty")
		return
	}
	fmt.Println(directory)
	files, err := ioutil.ReadDir(*directory)
	if err != nil {
		log.Fatal(err)
	}
	var first, second []string
	for i, f := range files {
		name := strings.TrimSuffix(f.Name(), filepath.Ext(f.Name()))
		if i%2 == 0 {
			first = append(first, fmt.Sprintf(template, *directory+f.Name(), name))
		} else {
			second = append(second, fmt.Sprintf(template, *directory+f.Name(), name))
		}
	}
	fmt.Printf(templateWrap, strings.Join(first, "\r\n"), strings.Join(second, "\r\n"))
}
