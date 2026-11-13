package com.ira.ai

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private val executor = Executors.newSingleThreadExecutor()

    private var engine: Engine? = null
    private var conversation: Conversation? = null

    private lateinit var status: TextView
    private lateinit var output: TextView
    private lateinit var input: EditText
    private lateinit var sendButton: Button

    private val fileRequestCode = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        val title = TextView(this).apply {
            text = "Ira AI"
            textSize = 26f
        }

        status = TextView(this).apply {
            text = "Choose a local AI model to begin."
            textSize = 15f
        }

        val chooseButton = Button(this).apply {
            text = "Choose Local Model"
            setOnClickListener { chooseModel() }
        }

        output = TextView(this).apply {
            text = "Welcome! I'm Ira."
            textSize = 16f
            setPadding(0, 20, 0, 20)
        }

        input = EditText(this).apply {
            hint = "Message Ira..."
        }

        sendButton = Button(this).apply {
            text = "Send"
            isEnabled = false
            setOnClickListener { sendMessage() }
        }

        layout.addView(title)
        layout.addView(status)
        layout.addView(chooseButton)
        layout.addView(
            output,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )
        layout.addView(input)
        layout.addView(sendButton)

        setContentView(layout)
    }

    private fun chooseModel() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }

        startActivityForResult(intent, fileRequestCode)
    }

    @Deprecated("Legacy file picker callback")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)

        if (
            requestCode == fileRequestCode &&
            resultCode == RESULT_OK
        ) {
            val uri = data?.data ?: return

            status.text = "Preparing model..."

            executor.execute {
                try {
                    val modelFile = java.io.File(
                        filesDir,
                        "ira-model.litertlm"
                    )

                    contentResolver.openInputStream(uri).use { stream ->
                        requireNotNull(stream) {
                            "Could not open selected file."
                        }

                        modelFile.outputStream().use { destination ->
                            stream.copyTo(destination)
                        }
                    }

                    val newEngine = Engine(
                        EngineConfig(
                            modelPath = modelFile.absolutePath,
                            cacheDir = cacheDir.absolutePath
                        )
                    )

                    newEngine.initialize()

                    val newConversation =
                        newEngine.createConversation()

                    engine = newEngine
                    conversation = newConversation

                    runOnUiThread {
                        status.text = "Local AI is ready!"
                        sendButton.isEnabled = true
                    }

                } catch (error: Exception) {
                    runOnUiThread {
                        status.text =
                            "Model loading failed: ${error.message}"
                    }
                }
            }
        }
    }

    private fun sendMessage() {
        val message = input.text.toString().trim()
        if (message.isEmpty()) return

        sendButton.isEnabled = false
        status.text = "Ira is thinking..."

        executor.execute {
            try {
                val reply = requireNotNull(conversation)
                    .sendMessage(message)
                    .toString()

                runOnUiThread {
                    output.text = "You: $message\n\nIra: $reply"
                    input.text.clear()
                    status.text = "Local AI ready"
                    sendButton.isEnabled = true
                }

            } catch (error: Exception) {
                runOnUiThread {
                    status.text =
                        "AI error: ${error.message}"
                    sendButton.isEnabled = true
                }
            }
        }
    }

    override fun onDestroy() {
        executor.execute {
            conversation?.close()
            conversation = null

            engine?.close()
            engine = null
        }

        executor.shutdown()
        super.onDestroy()
    }
}
