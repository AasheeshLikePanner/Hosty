import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValue } from 'framer-motion';
import { 
  Lock, 
  UserX,
  Zap,
  CloudLightning
} from 'lucide-react';

const PremiumWebsite = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={scrollRef}
      className="bg-white text-black min-h-screen relative overflow-x-hidden"
    >
      {/* Gradient Progress Bar */}
      <motion.div 
        style={{ 
          scaleX: scrollYProgress,
          transformOrigin: 'left',
        }}
        className="fixed top-0 left-0 right-0 h-[2px] z-50 
                   bg-gradient-to-r from-purple-500 via-pink-500 to-red-500"
      />

      {/* Mouse Following Glow Effect */}
      <div 
        className="fixed pointer-events-none z-0"
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div 
          className="w-32 h-32 bg-black/5 rounded-full blur-3xl"
          style={{
            transition: 'all 0.1s ease-out'
          }}
        />
      </div>

      <div className="container mx-auto px-6 py-16 relative z-10 max-w-5xl">
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl font-extralight tracking-tight mb-4">
            Infinite Transfer
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Seamless, secure file sharing without boundaries
          </p>
        </motion.header>

        {/* Features Section */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: { 
              opacity: 1,
              transition: { staggerChildren: 0.1 }
            }
          }}
          className="grid md:grid-cols-3 gap-4 mb-16"
        >
          {[
            { 
              Icon: Zap, 
              title: "Direct Transfer", 
              description: "Zero-latency peer-to-peer exchange" 
            },
            { 
              Icon: Lock, 
              title: "Military Encryption", 
              description: "Quantum-level security protocol" 
            },
            { 
              Icon: CloudLightning, 
              title: "Instant Sync", 
              description: "Lightspeed file transmission" 
            }
          ].map(({ Icon, title, description }, index) => (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              whileHover={{ 
                scale: 1.02,
                transition: { duration: 0.2 }
              }}
              className="border border-black/10 rounded-lg p-6 text-center 
                         transition-all duration-300 group"
            >
              <Icon 
                className="mx-auto mb-4 w-10 h-10 
                           text-black opacity-70 
                           group-hover:scale-110 transition-transform"
              />
              <h3 className="font-medium text-lg mb-2">{title}</h3>
              <p className="text-gray-600 text-sm">{description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* FAQ Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl font-light text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto">
            <FAQAccordion 
              faqs={[
                {
                  question: "How secure is the transfer?",
                  answer: "Utilizing end-to-end encryption with zero-knowledge architecture, ensuring absolute data privacy."
                },
                {
                  question: "What are the file size limits?",
                  answer: "Seamlessly transfer files up to 5GB with our advanced compression technologies."
                },
                {
                  question: "Do I need an account?",
                  answer: "No account required. Instant, friction-free file sharing with a single link."
                }
              ]}
            />
          </div>
        </motion.section>
      </div>
    </div>
  );
};

const FAQAccordion = ({ faqs }) => {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="space-y-2">
      {faqs.map((faq, index) => (
        <div 
          key={index} 
          className="border-b border-black/10 last:border-b-0"
        >
          <motion.div
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="flex justify-between items-center py-4 cursor-pointer"
            whileTap={{ scale: 0.99 }}
          >
            <h3 className="font-medium">{faq.question}</h3>
            <motion.div
              animate={{ rotate: openIndex === index ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </motion.div>
          </motion.div>
          
          <AnimatePresence>
            {openIndex === index && (
              <motion.div
                initial="collapsed"
                animate="open"
                exit="collapsed"
                variants={{
                  open: { opacity: 1, height: "auto", marginBottom: 16 },
                  collapsed: { opacity: 0, height: 0, marginBottom: 0 }
                }}
                transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="text-gray-600 text-sm pb-4"
              >
                {faq.answer}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
};

export default PremiumWebsite;