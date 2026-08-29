import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import type {Root, RootContent, Heading, Text,} from "mdast"
import type { DocumentSection } from "../types/document.js";

const parser = unified().use(remarkParse).use(remarkGfm)

export function parseMarkdown(markdown:string):DocumentSection[]{
    const tree=parser.parse(markdown)
    return buildSectionTree(tree);
}

function buildSectionTree(tree:Root):DocumentSection[]{
    const sections:DocumentSection[]=[];
    let currentSection:DocumentSection|null=null;
    for (const node of tree.children){
        if(node.type=="heading"){
            const heading = node as Heading;
            const title=extractText(heading);
            const section:DocumentSection={
                title,
                level:heading.depth,
                content:"",
                children:[]
            }
            if(heading.depth===1)
                sections.push(section);
            else{
                const parent=findParent(sections,heading.depth)
                if(parent)
                {
                    parent.children.push(section);
                }
                else
                {
                    sections.push(section);
                }
            }
            currentSection=section;
            continue;
        }
        if(currentSection)
        {
            currentSection.content+=extractNodeText(node)+"\n";
        }
    }
return sections;
}

function findParent(sections:DocumentSection[],level:number):DocumentSection|null
{
if(sections.length==0)
    return null;
 const last=sections[sections.length-1];
 if(last && last.level===level-1)
    return last;
return findParent(last?last.children:[],level)

   
}

function extractText(node:Heading):string{
return node.children.filter((child):child is Text=>child.type==="text").map((child)=>child.value).join("")
}

function extractNodeText(node:RootContent){
    if("value" in node){
        return node.value
    }

    if("children" in node){
        return node.children.map((child)=>{
            if("value" in child) 
            {
                return child.value;
            }
            return "";
            
            
        }).join("")

    }
    return "";
}