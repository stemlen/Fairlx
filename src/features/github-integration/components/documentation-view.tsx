"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FileText, Loader2, RefreshCw, Download, FileDown, Save, Send, Sparkles, X, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { 
  useGetDocumentation, 
  useGenerateDocumentation, 
  useGetRepository,
  useRefineDocumentation, 
  useSaveDocumentation 
} from "../api/use-github";
import { exportToWord, exportToPDF } from "../lib/export-utils";
import { GitHubOptionalPrompt } from "./github-optional-prompt";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";

interface DocumentationViewProps {
  projectId: string;
}

// Helper function to extract specific sections from markdown
const extractSection = (content: string, keywords: string[]): string => {
  const lines = content.split('\n');
  const relevantLines: string[] = [];
  let capturing = false;
  let captureDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = line.match(/^#+\s/);
    
    if (isHeader) {
      const headerLevel = line.match(/^#+/)?.[0].length || 0;
      const headerText = line.replace(/^#+\s/, '');
      
      const matchesKeyword = keywords.some(keyword => 
        headerText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (matchesKeyword) {
        capturing = true;
        captureDepth = headerLevel;
        relevantLines.push(line);
      } else if (capturing && headerLevel <= captureDepth) {
        capturing = false;
      } else if (capturing) {
        relevantLines.push(line);
      }
    } else if (capturing) {
      relevantLines.push(line);
    }
  }

  return relevantLines.length > 0 
    ? relevantLines.join('\n') 
    : '# No specific section found\n\nThis documentation does not contain the requested section.';
};

export const DocumentationView = ({ projectId }: DocumentationViewProps) => {
  const workspaceId = useWorkspaceId();
  const { data: repository } = useGetRepository(projectId);
  const { data: savedDocumentation, isLoading } = useGetDocumentation(projectId);
  const { mutate: generateDocumentation, isPending: isGenerating } = useGenerateDocumentation();
  const { mutate: refineDocumentation, isPending: isRefining } = useRefineDocumentation();
  const { mutate: saveDocumentation, isPending: isSaving } = useSaveDocumentation();

  const [previewData, setPreviewData] = useState<{
    content: string | null;
    fileStructure?: string;
    mermaidDiagram?: string;
    generatedAt?: string;
  }>({
    content: null,
  });

  const [refinePrompt, setRefinePrompt] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("full");

  // Load saved content into preview if available
  useEffect(() => {
    if (savedDocumentation && !previewData.content) {
      setPreviewData({
        content: savedDocumentation.content,
        fileStructure: savedDocumentation.fileStructure,
        mermaidDiagram: savedDocumentation.mermaidDiagram,
        generatedAt: savedDocumentation.generatedAt,
      });
    }
  }, [savedDocumentation, previewData.content]);

  const handleGenerate = () => {
    generateDocumentation(
      { json: { projectId } },
      {
        onSuccess: (response) => {
          setPreviewData({
            content: response.data.content,
            fileStructure: response.data.fileStructure,
            mermaidDiagram: response.data.mermaidDiagram,
            generatedAt: new Date().toISOString(),
          });
          setActiveTab("full");
          toast.success("Documentation generated for preview");
        },
        onError: (error: unknown) => {
          const err = error as { response?: { data?: { message?: string } }; message?: string };
          const message = err.response?.data?.message || err.message || "Generation failed";
          if (message.includes("QUOTA_EXHAUSTED")) {
            toast.error("AI Quota Exhausted", {
              description: "Your daily Gemini API limit (20 free requests) has been reached. Please upgrade your plan or try again tomorrow.",
              duration: 10000,
            });
          } else if (message.includes("ACCESS_DENIED")) {
            toast.error("GitHub Access Denied", {
              description: "The repository is private or access was revoked. Please re-link with a valid Personal Access Token.",
            });
          } else if (message.includes("RATE_LIMIT")) {
            toast.error("GitHub Rate Limit", {
              description: "GitHub is currently rate-limiting requests. Please try again in 1 minute.",
            });
          } else {
            toast.error(message);
          }
        }
      }
    );
  };

  const handleRefine = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!refinePrompt.trim() || !previewData.content) return;

    refineDocumentation(
      {
        json: {
          projectId,
          prompt: refinePrompt,
          currentContent: previewData.content,
        },
      },
      {
        onSuccess: (response) => {
          setPreviewData(prev => ({
            ...prev,
            content: response.data.content,
          }));
          setRefinePrompt("");
          toast.success("Documentation refined successfully");
        },
      }
    );
  };

  const handleSave = () => {
    if (!previewData.content) return;

    saveDocumentation(
      {
        json: {
          projectId,
          content: previewData.content,
          fileStructure: previewData.fileStructure,
          mermaidDiagram: previewData.mermaidDiagram,
        },
      },
      {
        onSuccess: () => {
          // Content is saved
        },
      }
    );
  };

  const handleDiscard = () => {
    setPreviewData({
      content: savedDocumentation?.content || null,
      fileStructure: savedDocumentation?.fileStructure,
      mermaidDiagram: savedDocumentation?.mermaidDiagram,
      generatedAt: savedDocumentation?.generatedAt,
    });
    toast.info("Changes discarded");
  };

  const hasUnsavedChanges = previewData.content !== savedDocumentation?.content;

  const handleExportWord = async () => {
    if (!previewData.content) return;
    setIsExporting(true);
    try {
      await exportToWord(previewData.content, "repository-documentation");
      toast.success("Exported to Word");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!previewData.content) return;
    setIsExporting(true);
    try {
      await exportToPDF(previewData.content, "repository-documentation");
      toast.success("Exported to PDF");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!previewData.content && !savedDocumentation) {
    if (!repository) {
      return (
        <div className="space-y-6">
          <GitHubOptionalPrompt projectId={projectId} workspaceId={workspaceId} />
          <Card className="border-dashed border-2 rounded-[2rem] bg-slate-50/50 dark:bg-slate-900/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CardTitle className="text-2xl font-black mb-3 tracking-tighter">Technical code docs need a repo</CardTitle>
              <CardDescription className="text-center mb-6 max-w-lg font-medium leading-relaxed opacity-70">
                This page analyzes GitHub source. Add a repository when you have one. Until then, skip it and generate PRD, sprint, and user docs from Fairlx.
              </CardDescription>
              <Button asChild variant="outline" className="h-10 px-6 rounded-xl text-xs font-semibold">
                <Link href={`/workspaces/${workspaceId}/projects/${projectId}/docs`}>Write planning docs instead</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <Card className="border-dashed border-2 rounded-[2rem] bg-slate-50/50 dark:bg-slate-900/50">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center w-20 h-20 rounded-[2.5rem] bg-primary/10 mb-8 border-2 border-primary/20 shadow-xl shadow-primary/5">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-3xl font-black mb-4 tracking-tighter">Automated Codebase Documentation</CardTitle>
          <CardDescription className="text-lg text-center mb-10 max-w-lg font-medium leading-relaxed opacity-70">
            Harness the power of high-density AI to analyze your entire repository and generate world-class, 
            professional technical manuals instantly in a clean, structured Notion-style format.
          </CardDescription>
          <Button onClick={handleGenerate} disabled={isGenerating} className="h-12 px-10 gap-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black shadow-2xl shadow-primary/20 transition-all active:scale-95">
            {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            Generate Comprehensive Documentation
          </Button>
        </CardContent>
      </Card>
    );
  }

  const contentToDisplay = previewData.content || "";

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-2 bg-background/40 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border-2 border-primary/20 shadow-inner group transition-all duration-300 hover:bg-primary/20">
            <FileText className="h-7 w-7 text-primary group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">Project Documentation</h2>
              {hasUnsavedChanges && (
                <Badge variant="secondary" className="px-2.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200/50 text-[10px] font-bold uppercase tracking-wide">
                  Unsaved Draft
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-widest">
               <span className="flex items-center gap-1.5">
                 <Sparkles className="h-3 w-3 text-primary/60" /> 
                 Technical Architect
               </span>
               {previewData.generatedAt && (
                 <>
                   <span className="opacity-20 select-none">•</span>
                   <span className="normal-case tracking-normal font-medium text-slate-500">
                     Generated on {new Date(previewData.generatedAt).toLocaleString(undefined, {
                       dateStyle: 'medium',
                       timeStyle: 'short'
                     })}
                   </span>
                 </>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <div className="flex items-center gap-3 mr-3 pr-3 border-r border-border/60">
              <Button 
                onClick={handleDiscard} 
                variant="ghost" 
                size="sm" 
                className="h-9 px-3 text-slate-500 hover:text-destructive font-bold transition-colors"
              >
                <X className="h-4 w-4 mr-1.5" /> Discard
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving} 
                size="sm" 
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md shadow-emerald-500/20 font-bold border-b-2 border-emerald-800 transition-all active:translate-y-px active:border-b-0"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Documentation
              </Button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleExportWord} 
              disabled={isExporting}
              variant="outline" 
              size="sm" 
              className="h-9 px-3 gap-2 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4 text-primary" />}
              Export Word
            </Button>
            <Button 
              onClick={handleExportPDF} 
              disabled={isExporting}
              variant="outline" 
              size="sm" 
              className="h-9 px-3 gap-2 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-primary" />}
              Export PDF
            </Button>
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating} 
              variant="outline" 
              size="sm" 
              className="h-9 px-4 gap-2 border-primary/40 text-primary hover:bg-primary/5 font-black transition-all group"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />}
              Full Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-slate-100/50 dark:bg-slate-900/50 p-1.5 mb-6 h-12 border shadow-inner rounded-2xl w-fit">
              <TabsTrigger value="full" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-lg px-8 h-9 rounded-xl transition-all">Manual Content</TabsTrigger>
              <TabsTrigger value="api" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-lg px-8 h-9 rounded-xl transition-all">API Specs</TabsTrigger>
              <TabsTrigger value="structure" className="text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-lg px-8 h-9 rounded-xl transition-all">Project Architecture</TabsTrigger>
            </TabsList>

            <Card className="border-2 border-border/40 shadow-2xl overflow-hidden bg-background/80 backdrop-blur-xl rounded-[2rem] transition-all duration-500 hover:border-primary/20">
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-360px)] w-full custom-scrollbar">
                  <div className="p-12 md:p-16 prose prose-slate dark:prose-invert max-w-none 
                    prose-headings:text-slate-950 dark:prose-headings:text-slate-50 prose-headings:tracking-tighter prose-headings:font-black
                    prose-h1:text-5xl prose-h1:mb-12 prose-h1:border-b-4 prose-h1:border-primary/10 prose-h1:pb-8
                    prose-h2:text-3xl prose-h2:mt-16 prose-h2:mb-8 prose-h2:flex prose-h2:items-center prose-h2:gap-4
                    prose-h3:text-2xl prose-h3:mt-12 prose-h3:mb-6 prose-h3:text-primary
                    prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-[1.8] prose-p:mb-8 prose-p:text-xl prose-p:font-medium
                    prose-ul:my-8 prose-li:my-3 prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-li:text-xl prose-li:font-medium
                    prose-code:bg-slate-100 dark:prose-code:bg-slate-900 prose-code:px-2.5 prose-code:py-1 prose-code:rounded-xl prose-code:text-primary prose-code:font-mono prose-code:text-base prose-code:before:content-none prose-code:after:content-none prose-code:font-black
                    prose-pre:bg-[#0d1117] prose-pre:p-0 prose-pre:rounded-[2rem] prose-pre:border-2 prose-pre:border-slate-800/50 prose-pre:my-10 prose-pre:shadow-[0_20px_50px_rgba(0,0,0,0.5)]
                    ">
                    <TabsContent value="full" className="m-0 focus-visible:outline-none animate-in fade-in duration-500">
                      <ReactMarkdown
                        components={{
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "");
                            return !inline && match ? (
                              <div className="rounded-[2rem] overflow-hidden border border-slate-700/50 group">
                                <div className="flex items-center justify-between px-6 py-4 bg-[#161b22] border-b border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                                    <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                                    <span className="ml-4 text-xs font-mono text-slate-500 uppercase tracking-widest font-black opacity-80">{match[1]}</span>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="xs" 
                                    className="h-8 px-3 text-[10px] uppercase font-black tracking-widest text-slate-500 hover:text-white transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(String(children));
                                      toast.success("Code copied to clipboard");
                                    }}
                                  >
                                    Copy Code
                                  </Button>
                                </div>
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ margin: 0, padding: '2.5rem', fontSize: '15px', lineHeight: '1.8', backgroundColor: '#0d1117' }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className={className} {...props}>{children}</code>
                            );
                          }
                        }}
                      >
                        {contentToDisplay}
                      </ReactMarkdown>
                    </TabsContent>

                    <TabsContent value="api" className="m-0 focus-visible:outline-none animate-in slide-in-from-right-2 duration-500">
                      <ReactMarkdown>
                        {extractSection(contentToDisplay, ['API', 'Endpoints', 'Architecture', 'Tech Stack', 'Interface', 'Logic', 'Server'])}
                      </ReactMarkdown>
                    </TabsContent>

                    <TabsContent value="structure" className="m-0 focus-visible:outline-none animate-in slide-in-from-bottom-2 duration-500">
                       <div className="space-y-16 py-6">
                        <section>
                          <div className="flex items-center justify-between mb-10">
                            <h2 className="text-3xl font-black tracking-tighter m-0 flex items-center gap-4">
                               <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                                 <FileText className="h-7 w-7 text-primary" /> 
                               </div>
                               Repository Topology
                            </h2>
                            <Badge variant="outline" className="px-4 py-1.5 border-2 rounded-xl text-xs font-black uppercase tracking-widest opacity-60">
                              System Scan Active
                            </Badge>
                          </div>
                          <div className="bg-[#050510] rounded-[2.5rem] p-10 font-mono text-sm text-slate-300 border-2 border-slate-800/60 shadow-[inset_0_2px_40px_rgba(0,0,0,0.8)] overflow-hidden group hover:border-primary/30 transition-colors">
                            <pre className="whitespace-pre overflow-x-auto leading-relaxed custom-scrollbar py-2 font-medium opacity-90">
                              {previewData.fileStructure || "Deep scanning repository tree structure... Please click Regenerate if this persists."}
                            </pre>
                          </div>
                        </section>

                        <section className="pt-12 border-t-2 border-border/30">
                           <div className="mb-10">
                             <h2 className="text-3xl font-black tracking-tighter m-0">Modular Blueprint</h2>
                             <p className="text-xl text-muted-foreground mt-4 font-medium leading-relaxed max-w-2xl">
                               Dynamic architectural visualization mapping core service dependencies and high-level system flows.
                             </p>
                           </div>
                           <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[2.5rem] p-12 border-4 border-slate-200/50 dark:border-slate-800/50 border-dashed flex flex-col items-center justify-center min-h-[400px] shadow-inner group">
                              {previewData.mermaidDiagram ? (
                                <div className="w-full space-y-8">
                                  <div className="relative">
                                    <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
                                    <pre className="relative p-10 bg-background rounded-[2rem] font-mono text-xs w-full overflow-x-auto border-2 border-border/60 shadow-2xl max-h-[500px] leading-relaxed">
                                      {previewData.mermaidDiagram}
                                    </pre>
                                  </div>
                                  <div className="flex justify-center">
                                    <div className="px-6 py-2.5 bg-background rounded-2xl border shadow-sm flex items-center gap-3">
                                       <div className="flex -space-x-1.5">
                                         <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                         <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse delay-100" />
                                       </div>
                                       <span className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-80">
                                         Visual engine compiling blueprint
                                       </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <div className="w-20 h-20 rounded-[2rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-6">
                                    <RefreshCw className="h-10 w-10 text-muted-foreground/40 animate-spin-slow" />
                                  </div>
                                  <p className="text-lg font-black text-slate-400">Architectural visualization preparing...</p>
                                  <p className="text-sm text-slate-500 mt-2 font-medium">Click Regenerate to initiate a fresh system analysis.</p>
                                </div>
                              )}
                           </div>
                        </section>
                       </div>
                    </TabsContent>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </Tabs>
        </div>

          {/* AI Refinement Sidebar */}
          <div className="lg:col-span-1">
            <Card className="h-full border-2 border-border/40 shadow-xl flex flex-col bg-background/60 backdrop-blur-xl sticky top-8 rounded-[2rem] overflow-hidden group hover:border-primary/20 transition-all duration-300">
              <CardHeader className="pb-6 border-b border-border/40 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3 text-primary">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-black tracking-tight">AI Architect</CardTitle>
                    <CardDescription className="text-[11px] font-bold uppercase tracking-widest opacity-60">
                      Iterative Refinement
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-6 pt-8">
                <form onSubmit={handleRefine} className="space-y-4">
                  <div className="relative group">
                    <Input
                      placeholder="e.g., 'Expand the security section' or 'Use a more technical tone'..."
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      className="min-h-[140px] text-sm py-4 px-5 align-top resize-none border-2 border-border/60 rounded-2xl focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all bg-background/50"
                      disabled={isRefining}
                    />
                    <div className="absolute bottom-3 right-3">
                      <Button 
                        type="submit" 
                        size="icon" 
                        className="h-9 w-9 rounded-xl shadow-lg shadow-primary/20 transition-transform active:scale-95" 
                        disabled={isRefining || !refinePrompt.trim()}
                      >
                        {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </form>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50 px-1">Prescripted Updates</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "sec", label: "Deep Security Audit", prompt: "Expansion Request: Add a comprehensive section detailing the project's security posture, authentication protocols, and data protection strategies." },
                      { id: "api", label: "Professional API Table", prompt: "Stylistic Update: Restructure the API documentation into a high-density, tabular format with strict parameter definitions." },
                      { id: "onb", label: "Engineer Onboarding", prompt: "Operational Update: Elaborate on the engineering onboarding process, including deterministic environment setup and CI/CD contributions." }
                    ].map(action => (
                      <Button 
                        key={action.id}
                        variant="ghost" 
                        size="xs" 
                        className="justify-start text-[11px] h-9 px-4 font-bold border border-transparent hover:border-primary/20 hover:bg-primary/5 hover:text-primary rounded-xl transition-all"
                        onClick={() => setRefinePrompt(action.prompt)}
                      >
                        <Check className="h-3.5 w-3.5 mr-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mt-auto pt-8 border-t border-border/40 font-black text-[10px] text-muted-foreground/60 tracking-widest flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    GEMINI ENGINE 2.5
                  </span>
                  <Badge variant="outline" className="h-5 text-[9px] font-black px-2 rounded-lg border-2 border-border/60">
                    STABLE
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };
