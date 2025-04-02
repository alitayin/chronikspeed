"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Eye, Copy, Check, ArrowLeft } from "lucide-react";
import { ChronikClient } from "chronik-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Default test address
const DEFAULT_ADDRESS = "ecash:qr6lws9uwmjkkaau4w956lugs9nlg9hudqs26lyxkv";
// Default record count
const DEFAULT_RECORD_COUNT = 10;
// Maximum record count
const MAX_RECORD_COUNT = 600;
// Chronik maximum page size
const MAX_PAGE_SIZE = 200;
// Default Token ID
const DEFAULT_TOKEN_ID = "ac31bb0bccf33de1683efce4da64f1cb6d8e8d6e098bc01c51d5864deb0e783f";

// Default node list
const DEFAULT_NODES = [
  "https://chronik1.alitayin.com",
  "https://chronik2.alitayin.com",
  "https://chronik.e.cash",
  "https://chronik-native1.fabien.cash",
  "https://chronik-native2.fabien.cash",
  "https://chronik-native3.fabien.cash",
  "https://chronik.pay2stay.com/xec",
  "https://chronik.pay2stay.com/xec2",
  "https://xec.paybutton.org",
];

// Transaction record type
interface Transaction {
  txid: string;
  [key: string]: unknown;
}

// Result type definition
interface TestResult {
  node: string;
  ip: string;
  ipLocation?: string;
  responseTime: number | string;
  historyTime: number | string;
  recordCount: number;
  dataSize: number | string;
  error?: string;
  data?: Record<string, unknown>;
}

// Token transaction test result type
interface TokenTestResult {
  node: string;
  ip: string;
  ipLocation?: string;
  responseTime: number | string;
  tokenTime: number | string;
  offerCount: number;
  takenCount: number;
  dataSize: number | string;
  error?: string;
  data?: Record<string, unknown>;
}

// Combined test result type
interface CombinedTestResult {
  node: string;
  ip: string;
  ipLocation?: string;
  responseTime: number | string;
  historyTime: number | string;
  recordCount: number;
  tokenTime: number | string;
  dataSize: number | string;
  agoraSupported: boolean;
  error?: string;
  data?: Record<string, unknown>;
  tokenData?: Record<string, unknown>;
}

// Extend JSON.stringify to handle BigInt and add formatting
const jsonStringifyWithBigIntFormatted = (obj: Record<string, unknown>): string => {
  return JSON.stringify(obj, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2);
};

// Measure response time (using blockchainInfo request to estimate network latency)
async function measureResponseTime(chronik: ChronikClient): Promise<number> {
  try {
    // Execute multiple requests and take the average for more accurate results
    const requestCount = 3;
    let totalTime = 0;
    
    for (let i = 0; i < requestCount; i++) {
      const start = Date.now();
      // Use blockchainInfo endpoint, which is a lightweight request
      await chronik.blockchainInfo();
      totalTime += (Date.now() - start);
    }
    
    return Math.round(totalTime / requestCount);
  } catch (error) {
    console.error(`Response time measurement failed:`, error);
    return -1;
  }
}

export default function Home() {
  const [address, setAddress] = useState<string>(DEFAULT_ADDRESS);
  const [recordCount, setRecordCount] = useState<number>(DEFAULT_RECORD_COUNT);
  const [nodes, setNodes] = useState<string>(DEFAULT_NODES.join("\n"));
  const [combinedResults, setCombinedResults] = useState<CombinedTestResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ipCache, setIpCache] = useState<Record<string, string>>({});
  const [selectedData, setSelectedData] = useState<Record<string, unknown> | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [tokenId, setTokenId] = useState<string>(DEFAULT_TOKEN_ID);
  const [ipLocationCache, setIpLocationCache] = useState<Record<string, string>>({});
  const [showConfig, setShowConfig] = useState<boolean>(true);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [userIp, setUserIp] = useState<string>("");
  const [userLocation, setUserLocation] = useState<string>("");

  // Get IP address for hostname
  useEffect(() => {
    async function fetchIPs() {
      const nodeList = nodes.split("\n").filter(node => node.trim() !== "");
      const newIpCache = { ...ipCache };
      let updated = false;

      for (const nodeUrl of nodeList) {
        try {
          const hostname = new URL(nodeUrl).hostname;
          if (!ipCache[hostname]) {
            try {
              const response = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
              const data = await response.json();
              if (data.Answer && data.Answer.length > 0) {
                const aRecords = data.Answer.filter((record: { type: number }) => record.type === 1);
                if (aRecords.length > 0) {
                  newIpCache[hostname] = aRecords[0].data;
                  updated = true;
                } else if (data.Answer[0].data) {
                  try {
                    const cnameResponse = await fetch(`https://dns.google/resolve?name=${data.Answer[0].data}&type=A`);
                    const cnameData = await cnameResponse.json();
                    if (cnameData.Answer && cnameData.Answer.length > 0) {
                      const cnameARecords = cnameData.Answer.filter((record: { type: number; data?: string }) => record.type === 1);
                      if (cnameARecords.length > 0) {
                        newIpCache[hostname] = cnameARecords[0].data;
                        updated = true;
                      }
                    }
                  } catch (cnameError) {
                    console.error(`Unable to resolve CNAME ${data.Answer[0].data}:`, cnameError);
                  }
                }
              }
            } catch (fetchError) {
              console.error(`Unable to resolve IP address for ${hostname}:`, fetchError);
            }
          }
        } catch (error) {
          console.error(`Invalid URL: ${nodeUrl}`, error);
        }
      }

      if (updated) {
        setIpCache(newIpCache);
      }
    }

    fetchIPs();
  }, [nodes, ipCache]);

  // Get IP geolocation information
  const getIpLocation = async (ip: string): Promise<string> => {
    if (ipLocationCache[ip]) {
      return ipLocationCache[ip];
    }
    
    try {
      const response = await fetch(`/api/ip-location?ip=${ip}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === "success") {
        const location = `${data.country}${data.city ? `, ${data.city}` : ""}`;
        setIpLocationCache(prev => ({ ...prev, [ip]: location }));
        return location;
      } else {
        return "Unknown";
      }
    } catch (error) {
      console.error("Failed to get IP location information:", error);
      return "Unknown";
    }
  };

  // Get user IP and location information
  useEffect(() => {
    async function fetchUserIpInfo() {
      try {
        const response = await fetch('/api/ip-location?ip=self');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status === "success") {
          setUserIp(data.query || "Unknown");
          setUserLocation(`${data.country}${data.city ? `, ${data.city}` : ""}`);
        }
      } catch (error) {
        console.error("Failed to get user IP information:", error);
      }
    }
    
    fetchUserIpInfo();
  }, []);

  // Test a single node
  async function testNode(nodeUrl: string, signal: AbortSignal): Promise<TestResult> {
    try {
      if (signal.aborted) {
        throw new Error("Test aborted");
      }

      const nodeName = nodeUrl;
      const hostname = new URL(nodeUrl).hostname;
      const nodeIP = ipCache[hostname] || "Resolving...";
      
      const chronik = new ChronikClient([nodeUrl]);
      const responseTime = await measureResponseTime(chronik);
      
      if (signal.aborted) {
        throw new Error("Test aborted");
      }
      
      const startTime = Date.now();
      
      const allTxs: Transaction[] = [];
      let totalDataSize = 0;
      const pageCount = Math.ceil(recordCount / MAX_PAGE_SIZE);
      
      for (let page = 0; page < pageCount; page++) {
        if (signal.aborted) {
          throw new Error("Test aborted");
        }
        
        const pageSize = Math.min(MAX_PAGE_SIZE, recordCount - page * MAX_PAGE_SIZE);
        const offset = page * MAX_PAGE_SIZE;
        
        const history = await chronik.address(address).history(offset, pageSize);
        
        if (history?.txs) {
          allTxs.push(...(history.txs as unknown as Transaction[]));
          
          try {
            const historyString = jsonStringifyWithBigIntFormatted(history as unknown as Record<string, unknown>);
            totalDataSize += new Blob([historyString]).size;
          } catch (sizeError) {
            console.error("Error calculating data size:", sizeError);
          }
        }
        
        if (!history?.txs || history.txs.length < pageSize) {
          break;
        }
      }
      
      if (signal.aborted) {
        throw new Error("Test aborted");
      }
      
      const duration = Date.now() - startTime;
      const dataSizeKB = (totalDataSize / 1024).toFixed(2);
      
      let ipLocation = "Unknown";
      if (nodeIP && nodeIP !== "Resolving..." && nodeIP !== "Unknown") {
        ipLocation = await getIpLocation(nodeIP);
      }

      return {
        node: nodeName,
        ip: nodeIP,
        ipLocation,
        responseTime: responseTime >= 0 ? responseTime : "N/A",
        historyTime: duration,
        recordCount: allTxs.length,
        dataSize: dataSizeKB,
        data: allTxs.length > 0 ? { txs: allTxs } : undefined,
      };
    } catch (nodeError) {
      if ((nodeError as Error).message === "Test aborted") {
        throw nodeError;
      }
      
      return {
        node: nodeUrl,
        ip: ipCache[new URL(nodeUrl).hostname] || "Unknown",
        ipLocation: "Unknown",
        responseTime: "N/A",
        historyTime: "N/A",
        recordCount: 0,
        dataSize: "0",
        error: nodeError instanceof Error ? nodeError.message : "Unknown error"
      };
    }
  }

  // Test token transactions for a single node
  async function testNodeToken(nodeUrl: string, signal: AbortSignal): Promise<TokenTestResult> {
    try {
      if (signal.aborted) {
        throw new Error("Test aborted");
      }
      
      const nodeName = nodeUrl;
      const hostname = new URL(nodeUrl).hostname;
      const nodeIP = ipCache[hostname] || "Resolving...";
      
      const chronik = new ChronikClient([nodeUrl]);
      const responseTime = await measureResponseTime(chronik);
      
      if (signal.aborted) {
        throw new Error("Test aborted");
      }
      
      const startTime = Date.now();
      
      try {
        const { Agora } = await import('ecash-agora');
        const agora = new Agora(chronik);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), 10000)
        );
        
        const pageSize = 50;
        const result = await Promise.race([
          agora.historicOffers({
            type: 'TOKEN_ID',
            tokenId,
            table: 'HISTORY',
            page: 0,
            pageSize
          }),
          timeoutPromise
        ]) as unknown as { offers: { status: string }[] };
        
        if (signal.aborted) {
          throw new Error("Test aborted");
        }
        
        const takenOffers = result.offers.filter(offer => offer.status === 'TAKEN');
        const duration = Date.now() - startTime;
        
        const resultString = jsonStringifyWithBigIntFormatted(result as unknown as Record<string, unknown>);
        const dataSizeKB = (new Blob([resultString]).size / 1024).toFixed(2);
        
        let ipLocation = "Unknown";
        if (nodeIP && nodeIP !== "Resolving..." && nodeIP !== "Unknown") {
          ipLocation = await getIpLocation(nodeIP);
        }

        return {
          node: nodeName,
          ip: nodeIP,
          ipLocation,
          responseTime: responseTime >= 0 ? responseTime : "N/A",
          tokenTime: duration,
          offerCount: result.offers.length,
          takenCount: takenOffers.length,
          dataSize: dataSizeKB,
          data: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        let ipLocation = "Unknown";
        if (nodeIP && nodeIP !== "Resolving..." && nodeIP !== "Unknown") {
          ipLocation = await getIpLocation(nodeIP);
        }
        
        return {
          node: nodeName,
          ip: nodeIP,
          ipLocation,
          responseTime: responseTime >= 0 ? responseTime : "N/A",
          tokenTime: "N/A",
          offerCount: 0,
          takenCount: 0,
          dataSize: "0",
          error: "Agora plugin not supported"
        };
      }
    } catch (error) {
      if ((error as Error).message === "Test aborted") {
        throw error;
      }
      
      return {
        node: nodeUrl,
        ip: ipCache[new URL(nodeUrl).hostname] || "Unknown",
        ipLocation: "Unknown",
        responseTime: "N/A",
        tokenTime: "N/A",
        offerCount: 0,
        takenCount: 0,
        dataSize: "0",
        error: "Connection error"
      };
    }
  }

  // Run all tests
  async function runAllTests() {
    setIsLoading(true);
    setCombinedResults([]);
    setShowConfig(false);
    
    // Create a new AbortController for cancelling tests
    const controller = new AbortController();
    setAbortController(controller);
    
    const nodeList = nodes.split("\n").filter(node => node.trim() !== "");
    
    try {
      for (const nodeUrl of nodeList) {
        if (controller.signal.aborted) {
          break;
        }
        
        try {
          const [addressResult, tokenResult] = await Promise.all([
            testNode(nodeUrl, controller.signal).catch(error => {
              if (error.message === "Test aborted") {
                throw error;
              }
              return {
                node: new URL(nodeUrl).hostname,
                ip: ipCache[new URL(nodeUrl).hostname] || "Unknown",
                ipLocation: "Unknown",
                responseTime: "N/A",
                historyTime: "N/A",
                recordCount: 0,
                dataSize: "0",
                error: error instanceof Error ? error.message : "Unknown error"
              } as TestResult;
            }),
            testNodeToken(nodeUrl, controller.signal).catch(error => {
              if (error.message === "Test aborted") {
                throw error;
              }
              return {
                node: new URL(nodeUrl).hostname,
                ip: ipCache[new URL(nodeUrl).hostname] || "Unknown",
                ipLocation: "Unknown",
                responseTime: "N/A",
                tokenTime: "N/A",
                offerCount: 0,
                takenCount: 0,
                dataSize: "0",
                error: error instanceof Error ? error.message : "Unknown error"
              } as TokenTestResult;
            })
          ]);
          
          const combinedResult: CombinedTestResult = {
            node: addressResult.node,
            ip: addressResult.ip,
            ipLocation: addressResult.ipLocation,
            responseTime: addressResult.responseTime,
            historyTime: addressResult.historyTime,
            recordCount: addressResult.recordCount,
            tokenTime: tokenResult.tokenTime,
            dataSize: addressResult.dataSize,
            agoraSupported: !!tokenResult.data,
            data: addressResult.data,
            tokenData: tokenResult.data,
          };
          
          if (addressResult.error) {
            combinedResult.error = `Address: ${addressResult.error}`;
          }
          
          setCombinedResults(prev => [...prev, combinedResult]);
        } catch (error) {
          if ((error as Error).message === "Test aborted") {
            break;
          }
        }
      }
    } catch (error) {
      console.error("Tests aborted:", error);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setAbortController(null);
      }
    }
  }

  // Handle record count input change
  const handleRecordCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      // Limit maximum to MAX_RECORD_COUNT
      setRecordCount(Math.min(value, MAX_RECORD_COUNT));
    } else if (e.target.value === "") {
      setRecordCount(0);
    }
  };

  // Add view data function
  const viewData = (data: Record<string, unknown>) => {
    setSelectedData(data);
    setDialogOpen(true);
  };

  // Add copy functionality
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success("Copied to clipboard");
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(err => {
        console.error('Copy failed:', err);
        toast.error("Copy failed: " + err.message);
      });
  };

  // Return to configuration page and terminate test
  const handleBackToConfig = () => {
    // Terminate ongoing test
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    setShowConfig(true);
    setIsLoading(false);
    setCombinedResults([]);
  };

  return (
    <div className="flex flex-col min-h-screen p-8">
      <main className="flex-1 max-w-6xl mx-auto w-full space-y-8">
        {!showConfig && (
          <Button 
            variant="outline" 
            size="sm" 
            className="mb-4 flex items-center" 
            onClick={handleBackToConfig}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Configuration
          </Button>
        )}
        
        {showConfig && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold">Chronik Node Performance Test Tool</h1>
              <p className="text-muted-foreground">Test performance and response time of different Chronik nodes</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Test Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="address" className="text-sm font-medium">Test Address</label>
                  <Input 
                    id="address"
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter eCash address"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="recordCount" className="text-sm font-medium">TXs Count</label>
                  <Input 
                    id="recordCount"
                    type="number"
                    min="1"
                    max={MAX_RECORD_COUNT}
                    value={recordCount} 
                    onChange={handleRecordCountChange}
                    placeholder="Number of records to fetch"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default is 10, maximum is 600. Chronik returns up to 200 records per page, larger amounts will be automatically paginated
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="tokenId" className="text-sm font-medium">Token ID (for Agora Plugin Test)</label>
                  <Input 
                    id="tokenId"
                    value={tokenId} 
                    onChange={(e) => setTokenId(e.target.value)}
                    placeholder="Enter token ID to test"
                  />
                  <p className="text-xs text-muted-foreground">
                    By default, only the first page of agora transactions will be fetched (pagesize=50)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="nodes" className="text-sm font-medium">Chronik Node List</label>
                  <textarea
                    id="nodes"
                    value={nodes}
                    onChange={(e) => setNodes(e.target.value)}
                    className="w-full min-h-[150px] p-2 border rounded-md"
                    placeholder="Enter one node URL per line"
                  />
                </div>
                
                <Button 
                  onClick={runAllTests} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? "Running Tests..." : "Run All Tests"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {!showConfig && (combinedResults.length > 0 || isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Test Results
                {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </CardTitle>
              {userIp && (
                <div className="text-sm text-muted-foreground">
                  Your IP: {userIp} {userLocation && `(${userLocation})`}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center">
                            Connect (ms)
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Time to connect to the node using chronik.blockchainInfo</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead>History (ms)</TableHead>
                    <TableHead>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center">
                            Agora (ms)
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Time to fetch token transactions using Agora plugin</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead>Data Size(KB)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Agora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinedResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{result.node}</TableCell>
                      <TableCell>{result.ip}</TableCell>
                      <TableCell>{result.ipLocation || "Unknown"}</TableCell>
                      <TableCell>{result.responseTime}</TableCell>
                      <TableCell>{result.historyTime}</TableCell>
                      <TableCell>{result.tokenTime}</TableCell>
                      <TableCell>
                        {result.dataSize}
                        {result.data && (
                          <Eye 
                            className="ml-2 h-4 w-4 inline cursor-pointer hover:text-primary" 
                            onClick={() => result.data && viewData(result.data)}
                          />
                        )}
                        {result.tokenData && (
                          <Eye 
                            className="ml-2 h-4 w-4 inline cursor-pointer hover:text-blue-500" 
                            onClick={() => result.tokenData && viewData(result.tokenData)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {result.error ? (
                          <span className="text-red-500">Failed: {result.error}</span>
                        ) : (
                          <span className="text-green-500">Success</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.agoraSupported ? (
                          <span className="text-green-500">Yes</span>
                        ) : (
                          <span className="text-red-500">No</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {isLoading && combinedResults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        <p>Testing in progress, please wait...</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-6xl w-[90vw] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex mt-4 justify-between items-center">
              <span>Transaction Data ({selectedData && 'txs' in selectedData ? (selectedData.txs as unknown[]).length : 
                (selectedData && 'offers' in selectedData ? (selectedData.offers as unknown[]).length : 0)} records)</span>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => selectedData && copyToClipboard(jsonStringifyWithBigIntFormatted(selectedData))}
                title="Copy to clipboard"
              >
                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md overflow-auto text-sm max-h-[60vh] w-full">
            <pre className="whitespace-pre-wrap break-words">
              {selectedData ? jsonStringifyWithBigIntFormatted(selectedData) : 'No data'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
